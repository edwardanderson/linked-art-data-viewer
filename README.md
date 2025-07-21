# Linked Art Data Viewer

An experimental [Linked Art](https://linked.art/) data viewer.

> [!WARNING]
> This is a vibe-coded prototype. No architecture, no tests.

![Example](example.png | width=25%)

Features:
- Class styles from the Linked Art documentation
- [IIIF Images](https://linked.art/model/digital/#iiif-images) are rendered in-line
- Breadcrumbs in the header
- Styling for hyperlinks which reference more Linked Art
- `jq` path tooltips
- Tabulated [Search Links](https://linked.art/api/1.0/hal/) in the footer

Known issues:
- Rendering `OrderedPage` results is broken
- No rendering for [Digital Images](https://linked.art/model/digital/#digital-images) or [IIIF Manfests](https://linked.art/model/digital/#iiif-manifests)
