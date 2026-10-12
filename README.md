# SRL Writer

A local-first workbench for composing and statically checking SITS SRL syntax.

## Current capabilities

- Guided inserts for fields, conditions, lists, SLPs, temporary variables and prompts
- Static delimiter, nesting, wildcard and catalogue checks
- Import of FLD BAR exports, including tooltip values containing a pipe character
- Searchable field catalogue with dictionary and entity context
- Browser-local draft and catalogue storage
- CRLF clipboard and text-file output

Static checks cannot prove SITS retrieval context or runtime behaviour. Validate completed SRLs using an appropriate TEST process before LIVE use.

## Local development

```sh
npm install
npm run dev
```

Real `.bar` files are ignored and must not be committed. Import them through the application when needed.

