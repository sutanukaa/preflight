# Initial check catalogue

| Key | Signal | Status policy | Important caveat |
|---|---|---|---|
| spf_record | DNS TXT SPF policy | fail if absent/duplicate; pass if one found | Syntax and recursive lookup budget still required |
| spf_auth | Trusted Authentication-Results | pass/fail/unknown | Never trust arbitrary sender-supplied results |
| spf_lookup_budget | Recursive SPF DNS mechanisms | fail above 10 | Implement loop, void and error handling |
| dkim_signature | DKIM-Signature header + trusted result | pass/fail/unknown | Header presence is not cryptographic verification |
| dkim_selector | selector._domainkey TXT | pass/fail/unknown | Selector must be supplied or extracted from signature |
| dmarc_record | _dmarc TXT | pass/fail | Parse tags and validate policy |
| dmarc_auth | Trusted DMARC result | pass/fail/unknown | Requires trusted receiving result |
| alignment | SPF or DKIM aligned to RFC5322 From | pass/fail/unknown | Use Public Suffix List aware organizational domain |
| mx_records | MX DNS records | pass/warning | Sending-only domains may not need MX |
| tls_evidence | Trusted transport metadata | pass/warning/unknown | Received headers alone are not definitive |
| list_unsubscribe | List-Unsubscribe header | pass/warning/not-applicable | Applicability depends on message type and sender obligations |
| one_click_unsubscribe | List-Unsubscribe-Post | pass/warning/not-applicable | Do not imply every email requires this |
| received_chain | Received hops | pass/warning/unknown | Some hops can be forged or missing |
| message_structure | MIME/header baseline | pass/warning | Hygiene signal, not spam verdict |
