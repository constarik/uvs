// uvl-gh v0.1 — atomic multi-file commits to constarik/uvs via the GitHub Git Data API.
// One operator action = one commit (blob → tree → commit → ref), SHA reported back.
// Used by the console for chain links and draw init; never for code (spec: data only).
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

  // files: [{path, text}] or [{path, buffer}] — committed atomically.
  async function commitFiles(pat, message, files) {
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

  root.uvlGh = { commitFiles: commitFiles, sha256Hex: sha256Hex };
})(typeof self !== 'undefined' ? self : this);
