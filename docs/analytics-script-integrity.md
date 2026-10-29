# Analytics script integrity

The static front end serves hash-pinned copies of the two Umami trackers from its own origin. Their `data-host-url` attributes keep dedicated and central collection separate, with the existing website IDs. The trackers do not depend on their original script hosts for code execution. A separate MIT license notice is retained beside the assets.

| Asset | Captured public source | SHA-384 (base64) |
| --- | --- | --- |
| `dedicated-script.js` | `https://analytics.np-servicerequest.org/script.js` | `OtlpAaPAGbsps9PCG+6V4bw+yXs7LvYsI2LPzOVB1F1d8lHiMWzK+xiSMoAPPahp` |
| `central-script.js` | `https://analytics.jacobdanderson.net/script.js` | `GCqIGuvWYg7O3NiELYWxOf/L6jh0MEUd1RXYXHaLbqZSLt7OY1ZAY8QSonb76YUk` |

These exact public bytes were captured and hash-checked on 2026-10-23. Updating either tracker requires review of the new code, updating the corresponding vendored asset and integrity value together, and rerunning source and built-output checks. A changed remote tracker does not silently change a released site.
