# Use a local model for bounded work

`tools/local_worker.py` talks to a running model server using an
OpenAI-compatible **Chat Completions** endpoint. It can work with a compatible
`llama-server`, Ollama, LM Studio, or another server. The model needs to follow
instructions and return JSON. Actual model quality and compatibility have not
been verified in this project.

The helper sends only the task and files named in a job. It saves a proposed
result in ignored `.local-worker/proposals/`; it does not execute generated
commands or edit project files during generation. A human or supervising
Codex can inspect the diff and apply it after review. A file changed since the
request will cause the entire proposal's preflight to fail.

## Connect an existing server

Start the local server using your existing setup. Do not put an address, model
path, or key into a committed file. Default endpoint:

`http://127.0.0.1:8080/v1/chat/completions`

On Windows PowerShell, set the endpoint and model name only for this shell;
replace the examples with values for your running server:

```powershell
$env:SNOW_WORKER_URL = "http://127.0.0.1:8080/v1/chat/completions"
$env:SNOW_WORKER_MODEL = "your-loaded-model-name"
py -3 tools/local_worker.py doctor
```

If the server uses an API key, set `SNOW_WORKER_API_KEY` in your environment
without pasting it into a tracked file. On Linux/macOS use `export` and
`python3` instead of PowerShell syntax and `py -3`.

`doctor` queries `/v1/models`; some compatible servers may support chat while
not implementing that endpoint. Configure `SNOW_WORKER_URL` explicitly if the
server is on another computer. `127.0.0.1` refers to the machine running the
helper. A Linux server stops when that same computer reboots into Windows.

The endpoint is whichever address you configure: a remote hosted endpoint
would receive the job files and may charge money. There is no automatic cloud
fallback. Avoid exposing an unauthenticated model server to the public internet.

## Run the first job

From `BOXGames/snow-crown/`:

```powershell
py -3 tools/local_worker.py propose --job jobs/plateau0-smoke-review.json
# Copy the printed project-relative proposal path into the following commands:
py -3 tools/local_worker.py show .local-worker/proposals/PROPOSAL_ID.json
# After reviewing the diff, if you want to use it:
py -3 tools/local_worker.py apply .local-worker/proposals/PROPOSAL_ID.json
```

The initial job asks for a narrow review of the Studio smoke test. A valid
result can propose zero files. Applying a proposal is not evidence that the code
works in Studio. Run the appropriate real Studio checks afterward.

## Define another job

Jobs are JSON objects with `task`, `read` and `write` fields. Paths are
project-relative and must use forward slashes. `read` lists context files;
`write` explicitly permits proposed output paths. `max_tokens` is optional.
Use only the smallest useful source files, specify acceptance criteria, and
avoid placing confidential data in a job sent to any untrusted endpoint.

The model can return full replacement contents for allowed files only. It has
no built-in shell, automatic file edit, or Studio MCP access through this
helper. For more autonomous work, an already-configured local coding agent
can be used separately; this bridge makes the simple, reviewable path portable.
The older `local-apodex` workflow may be reusable, but its availability and
settings need checking on your machine.

## Optional: run a local coding agent directly

For a more autonomous agent, a current Codex CLI can run with a local Ollama
or LM Studio provider. With the corresponding local provider running and a
compatible model loaded, an example from PowerShell is:

```powershell
$env:SNOW_WORKER_MODEL = "your-loaded-model-name"
Get-Content -Raw jobs/local-agent-plateau0.md | codex exec --oss --local-provider ollama --model $env:SNOW_WORKER_MODEL --sandbox workspace-write -
```

Choose `lmstudio` instead of `ollama` only if that provider is installed and
running. This launches a separate local-model agent session; it is not a
built-in cloud-agent subagent with its provider switched. The model must be
able to use the tools and follow the instructions reliably. The agent still
needs a working Studio MCP connection to operate Studio, and this path has not
been tested against your model or Windows environment. Review its changes and
verify results; it may fail, need more context, or use more time than Codex.

See [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
and [the CLI options](https://learn.chatgpt.com/docs/cli/reference). The
proposal helper above can use a compatible llama.cpp endpoint directly without
installing Ollama or LM Studio.

## Verify the helper offline

```powershell
py -3 -m unittest discover -s tests -v
```

The tests use a temporary mock HTTP server; they do not contact your model or
Roblox. Real server, model, and Studio behavior must be checked on the target machine.
