# Unicorn Forge licensing and third-party notices

Unicorn Forge application source is MIT licensed. Dependencies, runtimes, models, adapters, quantizations, hosted services, and generated outputs retain their own terms.

| Component | License / notice |
|---|---|
| Unicorn Forge, Electron, Node.js, electron-builder, SimpleWebAuthn, Ollama | MIT |
| Chromium | BSD-style and bundled third-party notices |
| ComfyUI | GPL-3.0 |
| Kokoro and FLUX.1 Schnell | Apache-2.0; verify individual voice/model files |
| Stable Diffusion XL | CreativeML Open RAIL++-M; use restrictions apply |
| Hermes Agent | Check the installed distribution and dependency notices |
| Tailscale | BSD-3-Clause client components plus service terms |
| ntfy | Check the installed server distribution and its Apache/GPL notices |

Installed language-model licenses appear in **Settings → Manage local AI models**. Qwen releases are generally Apache-2.0, Phi-4 generally MIT, Gemma uses custom Google Gemma Terms, Llama uses the custom Llama Community License, and Nomic Embed Text is Apache-2.0. Always verify the exact model card.

Abliterated, heretic, merged, converted, quantized, and GGUF models remain subject to applicable base-model terms and may add provider terms. Forge labels unclear cases **License not reported — verify provider model card**. Do not redistribute or use an unverified model commercially until reviewed.

Generated images receive `.license.txt` and `.license.json` provenance sidecars. User-installed MCP servers, plugins, VS Code, Brave, Obsidian, Git, GitHub CLI, Python packages, and additional models are separate installations with separate terms. Preserve upstream notices when redistributing. This information is not legal advice.
