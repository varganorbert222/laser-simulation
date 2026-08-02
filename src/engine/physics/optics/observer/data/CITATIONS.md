# CIE / CVRL observer datasheets — citations

Converted: 2026-08-02
Runtime: **no network** — tables live under `observer/data/generated/`.

| Id | Source file | MD5 | Citation |
|----|-------------|-----|----------|
| photopic | `vl1924e_1.csv` | `3d655c6c16dbca242c5843edb8ad107b` | CIE 1924 photopic V(λ), 1 nm (CVRL mirror of CIE table) ([DOI](https://doi.org/10.25039/CIE.DS.dktna2s3)) |
| scotopic | `scvle_1.csv` | `3d9a8869f187491796e188b791450611` | CIE 1951 scotopic V′(λ), 1 nm (CVRL / Wyszecki & Stiles) |
| cmf | `ciexyz31_1.csv` | `6dfc8143bff1e445b2555a6a7df2df22` | CIE 1931 2° colour-matching functions x̄,ȳ,z̄, 1 nm (CVRL) |
| lms | `linss2_10e_1.csv` | `23fdce9023f311990e9a77b04a504dfb` | Stockman & Sharpe (2000) 2° cone fundamentals L,M,S — CIE 2006-compatible LMS, 1 nm (CVRL) |
| mesopic-m08 | `(derived)` | `02f6ede7a3dd21fa635c0af6b9bd4389` | Educational blend target: normalize(0.8·V + 0.2·V′). Not a claim of CIE 191 dynamic mesopic compliance. |

## Provenance

- Raw CSV staged in `scripts/cie/raw/` (and optionally `temp/cie-datasheets/`).
- Photopic / scotopic / CMF / LMS downloaded from [CVRL](http://www.cvrl.org/).
- Mesopic m=0.8 is an **educational blend target** (normalize(0.8·V+0.2·V′)), not a claim of CIE 191 dynamic mesopic physiology compliance.
- Engine pack-side photopic lookup may still use the legacy 390–808 table until Phase B parity gate; HumanEye uses these CIE tables.
