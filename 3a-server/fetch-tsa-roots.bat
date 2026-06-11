@echo off
rem ============================================================================
rem Fetch TSA root certificates and build tsa-ca-bundle.pem for cfg.tsa.caFile.
rem
rem Trust-anchor rule: fetch roots DIRECTLY from each TSA's own site, on the
rem machine that will verify. Do not accept a bundle from a third party --
rem including from the draw operator. A verifier who distrusts this repo
rem re-runs these two downloads themselves.
rem
rem FreeTSA note: the TSA signing cert was renewed 2026-03-16 (P-384); tokens
rem made with -cert embed the chain, so ONLY the roots below are needed here.
rem ============================================================================
setlocal
curl -fsSL https://freetsa.org/files/cacert.pem -o freetsa-root.pem || goto :err
curl -fsSL https://cacerts.digicert.com/DigiCertTrustedRootG4.crt.pem -o digicert-g4-root.pem || goto :err

rem -- verify what we downloaded is a cert and print fingerprints for manual check
openssl x509 -in freetsa-root.pem -noout -subject -fingerprint -sha256 || goto :err
openssl x509 -in digicert-g4-root.pem -noout -subject -fingerprint -sha256 || goto :err

type freetsa-root.pem digicert-g4-root.pem > tsa-ca-bundle.pem
echo.
echo tsa-ca-bundle.pem written. Point cfg.tsa.caFile at it.
echo Cross-check the fingerprints above against the TSA sites (freetsa.org
echo publishes the key modulus on its homepage; DigiCert on its root page).
exit /b 0
:err
echo FAILED -- see message above.
exit /b 1
