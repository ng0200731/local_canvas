# Pantone Color Dataset

`pantone-colors.json` is vendored from the archived community dataset at
https://github.com/Margaret2/pantone-colors/blob/master/pantone-numbers.json.

`pantone-solid-coated.json` is parsed from Webtemple's public "All Pantone C
colors with HEX and RGB codes" table:
https://webtemple.design/resources/all-pantone-c-colors-with-hex-and-rgb-codes

For a larger Solid Coated Lab/ACB source, see:
https://github.com/aj90909/unofficial-pantone-solid-coated-2024-v5

The values are approximate web HEX values for Pantone Fashion, Home + Interiors
and Solid Coated codes. Do not treat them as official print-critical Pantone
matches.

## Optional licensed library imports

The app also loads these library files. The optional files are checked in as
empty arrays (`[]`) so every library endpoint exists; replace them with licensed
Pantone data when available:

- `pantone-solid-uncoated.json`
- `pantone-fhi-tpg.json`
- `pantone-metallics-coated.json`
- `pantone-premium-metallics-coated.json`
- `pantone-pastels-neons-coated.json`
- `pantone-pastels-neons-uncoated.json`
- `pantone-color-bridge-coated.json`
- `pantone-color-bridge-uncoated.json`

Use this JSON shape for optional libraries:

```json
[
  { "code": "Example 100 U", "name": "Example 100 U", "hex": "ffffff" }
]
```

`code` is optional; when omitted, `name` is used as the lookup code. Only add
datasets you are licensed to use.
