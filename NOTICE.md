# NOTICE — LTMi-XT licensing in plain English

LTMi-XT v0.1 · SOPHIA XT LLC · 2026

This repository is published under the **Apache License, Version 2.0**
(the formal terms are in [`LICENSE`](LICENSE)). This NOTICE summarizes
what that license means in everyday terms and adds two project-specific
clarifications about the file format and the project name. The formal
LICENSE is the legally controlling text — if anything below conflicts
with it, the LICENSE wins.

---

## TL;DR

You can:

- ✅ Use the code, commercially or non-commercially.
- ✅ Modify the code.
- ✅ Distribute the code (modified or not).
- ✅ Sublicense.
- ✅ Use it inside a larger product without releasing your product as
  open source.
- ✅ Charge money for products built with it.
- ✅ Produce, store, exchange, sell, ingest, or fine-tune on `.ltmi`
  files. The format is open — no notification, attribution, or fee
  required to *use* the format.

You must:

- ✏️ Include a copy of the Apache 2.0 license with any redistribution
  of the code.
- ✏️ Keep the existing copyright + attribution notices in source files
  you redistribute (this NOTICE file counts).
- ✏️ State if you've modified the source files.

You can't:

- ❌ Use the **SOPHIA XT** trademarks, the project name **LTMi-XT**,
  the file extension `.ltmi`, or any associated logos as the brand of
  your own commercial product, in a way that suggests endorsement by
  or affiliation with SOPHIA XT LLC. Informal references ("uses
  LTMi-XT", "compatible with the .ltmi format") are fine.
- ❌ Hold any contributor liable for damages caused by use of the
  software (Apache 2.0 disclaims warranty).
- ❌ Sue contributors over patents covering their contributions and
  expect to keep your patent license to this software.

---

## What this means for the four common use cases

### 1. You want to use the reference implementation in your own product
Yes — fork or import the package. Keep `LICENSE` and `NOTICE.md` (or
the equivalent attribution) in your distribution. Modify freely. You do
not need to release your product as open source.

### 2. You want to use the `.ltmi` file format in your own product
Yes — fully open. The format spec at [`docs/file-format-spec.md`](docs/file-format-spec.md)
is the canonical reference. Producers and consumers do not need to
notify or pay SOPHIA XT.

If you publish a tool that produces `.ltmi` bundles, please state
**"`.ltmi` v0.1 compatible"** rather than "implements LTMi-XT" — that
keeps the language about an open format separate from the project's
trademarked name.

### 3. You want to fine-tune a model on `.ltmi`-derived training data
Yes — fully open. The fine-tune ingestion pipeline (see paper §8) is
deterministic and reproducible. You own your trained models; SOPHIA XT
makes no claim on weights you produce.

### 4. You want to contribute back
Welcome. By submitting a PR you license your contribution under the
same Apache 2.0 terms (this is the standard "inbound = outbound"
arrangement made explicit in Apache 2.0 §5).

---

## Trademark scope

**SOPHIA XT®**, the **SOPHIA XT** wordmark, the project name
**LTMi-XT**, and the file extension `.ltmi` are trademarks or
project-name conventions of SOPHIA XT LLC.

The Apache 2.0 license **does not** grant trademark rights (this is
explicit in §6 of the formal license). Specifically:

- ✅ "We use LTMi-XT for our knowledge indexing layer" — fine.
- ✅ "Our product is `.ltmi` compatible" — fine.
- ✅ "We forked LTMi-XT and call our fork `MyKnowledge`" — fine
  (preferred — please don't ship a separate fork under the LTMi-XT
  name).
- ❌ "MyKnowledge by LTMi-XT" — not fine without permission, because
  it implies endorsement.
- ❌ Selling a SaaS named "LTMi-XT Cloud" without permission — not
  fine, because it could mislead users into thinking SOPHIA XT runs
  that service.

If you have a use case that's near a line, email
**contactus@sophiaxt.com** and we'll respond. The trademark rules exist
to keep users from being misled — they are not meant to discourage
use, integration, or healthy competition.

---

## Disclaimer of warranty

The reference implementation, the file format specification, the system
prompts, the example corpora, and the paper are all provided **"AS IS"**,
without warranty of any kind. Real evaluation has been deliberately
deferred to a later release; v0.1 ships the architecture and the methodology.
The paper's §11 ("Limitations") states the current scope honestly.

---

## Contact

- Website: <https://sophiaxt.com/research/ltmi-xt>
- Demo: <https://sophiaxt.com/tools/ltmi-xt>
- Email: contactus@sophiaxt.com
- Issues: <https://github.com/Chorozion/LTMi-XT/issues> (preferred for
  technical questions)

---

*This NOTICE is informational. The formal license terms in
[`LICENSE`](LICENSE) are the legally controlling text.*
