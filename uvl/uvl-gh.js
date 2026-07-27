// uvl-gh v0.2 — commits to constarik/uvs from the console.
// Preferred path: atomic multi-file commit via the Git Data API (blob→tree→commit→ref).
// Fallback (v0.2): some fine-grained PATs get HTTP 403 on /git/* — then the Contents
// API is used instead: one commit per file, ordered so the pointer file (chain.json,
// index.json) lands LAST. A failure mid-sequence leaves an unreferenced data file,
// which is harmless; the pointer never references anything that is not yet committed.
(function (root) {
  'use strict';
  const API = 'https://api.github.com/repos/constarik/uvs';
  const BRANCH = 'master';

  async function gh(pat, path, opts) {
    const r = await fetch(API + path, Object.assign({}, opts, {
      headers: Object.assign({
        Authorization: 'Bearer ' + pat,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      }, (opts && opts.headers) || {})
    }));
    if (!r.ok) throw new Error('GitHub ' + path + ' -> HTTP ' + r.status + ': ' + (await r.text()).slice(0, 200));
    return r.json();
  }

  function bufToBase64(buf) {              // chunked — dumps are hundreds of KB
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  async function sha256Hex(buf) {
    const d = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // files: [{path, text}] or [{path, buffer}]. Atomic when the token allows /git/*;
  // otherwise sequential Contents-API commits in the given order (put pointers last).
  async function commitFiles(pat, message, files) {
    try {
      return await commitAtomic(pat, message, files);
    } catch (e) {
      if (!/HTTP 403/.test(String(e.message))) throw e;
      return await commitSequential(pat, message, files) + ' (sequential fallback)';
    }
  }

  async function commitAtomic(pat, message, files) {
    const ref = await gh(pat, '/git/ref/heads/' + BRANCH);
    const headSha = ref.object.sha;
    const head = await gh(pat, '/git/commits/' + headSha);
    const treeItems = [];
    for (const f of files) {
      const blob = f.buffer
        ? await gh(pat, '/git/blobs', { method: 'POST', body: JSON.stringify({ content: bufToBase64(f.buffer), encoding: 'base64' }) })
        : await gh(pat, '/git/blobs', { method: 'POST', body: JSON.stringify({ content: f.text, encoding: 'utf-8' }) });
      treeItems.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const tree = await gh(pat, '/git/trees', { method: 'POST',
      body: JSON.stringify({ base_tree: head.tree.sha, tree: treeItems }) });
    const commit = await gh(pat, '/git/commits', { method: 'POST',
      body: JSON.stringify({ message: message, tree: tree.sha, parents: [headSha] }) });
    await gh(pat, '/git/refs/heads/' + BRANCH, { method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false }) });
    return commit.sha;
  }

  async function commitSequential(pat, message, files) {
    let last = null;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const b64 = f.buffer ? bufToBase64(f.buffer)
                           : btoa(unescape(encodeURIComponent(f.text)));
      // update needs the current file sha, if the file exists
      let sha;
      const probe = await fetch(API + '/contents/' + f.path + '?ref=' + BRANCH,
        { headers: { Authorization: 'Bearer ' + pat, Accept: 'application/vnd.github+json' } });
      if (probe.ok) sha = (await probe.json()).sha;
      const body = { message: message + ' [' + (i+1) + '/' + files.length + ']',
                     content: b64, branch: BRANCH };
      if (sha) body.sha = sha;
      const res = await gh(pat, '/contents/' + f.path, { method: 'PUT', body: JSON.stringify(body) });
      last = res.commit.sha;
    }
    return last;
  }

  root.uvlGh = { commitFiles: commitFiles, sha256Hex: sha256Hex };
})(typeof self !== 'undefined' ? self : this);
