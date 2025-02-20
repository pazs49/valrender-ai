const vscode = require("vscode");
const { exec } = require("child_process");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const util = require("util");
const execAsync = util.promisify(exec);

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const disposable = vscode.commands.registerCommand(
    "valrenderai.start",
    async function () {
      await runTailwind();

      const globalState = context.globalState; // element, ollamaApiUrl, aiModel

      const panel = vscode.window.createWebviewPanel(
        "valrenderai",
        "ValRender AI",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, "src"),
          ],
          retainContextWhenHidden: true,
        }
      );

      const outputCssPath = vscode.Uri.joinPath(
        context.extensionUri,
        "src",
        "css",
        "output.css"
      );

      const outPutSrc = panel.webview.asWebviewUri(outputCssPath);

      panel.webview.html = getWebviewContent(
        outPutSrc,
        globalState.get("element"),
        globalState.get("ollamaApiUrl"),
        globalState.get("aiModel")
      );

      panel.webview.onDidReceiveMessage(
        async (message) => {
          if (message.command === "create") {
            vscode.window.showInformationMessage("Creating element...");
            const element = message.message;
            try {
              const data = await axios.post(
                `${globalState.get("ollamaApiUrl")}`,
                {
                  model: `${globalState.get("aiModel")}`,
                  messages: [
                    {
                      role: "system",
                      content: `You are a frontend design engineer that helps build designs and elements for the user. The output should be in HTML and Tailwind classes. If the user's request is simple (e.g., "green button"), return only the specific element without additional HTML, <style>, or <script> tags. If the design requires animations, interactions, or advanced styling, enclose the entire output within a <div> element that wraps both the HTML structure and any necessary <style> or <script> tags. If the user pastes an element, improve or edit it according to their description and follow the same rules for simplicity or complexity.`,
                    },
                    {
                      role: "user",
                      content: `"${element}"`,
                    },
                  ],
                  stream: false,
                  options: {
                    temperature: 0.5,
                  },
                  format: {
                    type: "object",
                    properties: {
                      element: {
                        type: "string",
                      },
                    },
                    required: ["element"],
                  },
                }
              );
              vscode.window.showInformationMessage("Element created.");
              const content = JSON.parse(data.data.message.content);

              globalState.update("element", content.element);

              const outputHtmlPath = vscode.Uri.joinPath(
                context.extensionUri,
                "src",
                "html",
                "output.html"
              );

              fs.writeFileSync(outputHtmlPath.fsPath, content.element);

              await runTailwind();

              panel.webview.postMessage({
                command: "displayElement",
                element: content.element,
              });
            } catch (error) {
              vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
          }

          if (message.command === "copyElement") {
            if (!globalState.get("element")) {
              vscode.window.showInformationMessage("No element to copy.");
              return;
            }

            vscode.window.showInformationMessage(
              "Element copied to clipboard."
            );

            vscode.env.clipboard.writeText(globalState.get("element"));
          }

          if (message.command === "setOllamaApiUrl") {
            globalState.update("ollamaApiUrl", message.message);
          }
          if (message.command === "setAiModel") {
            globalState.update("aiModel", message.message);
          }
          if (message.command === "setupModalExit") {
            vscode.window.showInformationMessage("Setup modal exited.");
            vscode.commands.executeCommand(
              "workbench.action.webview.reloadWebviewAction"
            );
          }
        },
        undefined,
        context.subscriptions
      );
    }
  );

  context.subscriptions.push(disposable);
}

function deactivate() {}

function getWebviewContent(outPutSrc, element, ollamaApiUrl, aiModel) {
  return /*html*/ `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="${outPutSrc}" rel="stylesheet">
      <title>ValRender AI</title>
      <script>
        document.addEventListener("DOMContentLoaded", () => {
					const vscode = acquireVsCodeApi();
          
          const messageInput = document.getElementById('messageInput')

          const createButton = document.getElementById('createButton');
          createButton.addEventListener('click', ()=>{
            if(messageInput.value.length > 0){
              vscode.postMessage({
                command: 'create',
                message: messageInput.value
              })
            }
          })          

          const copyElementButton = document.getElementById('copyElementButton');
          copyElementButton.addEventListener('click', () => {
            vscode.postMessage({
              command: 'copyElement',
            })
          })

          const setupModal = document.getElementById('setupModal');
          setupModal.addEventListener('click', (event) => {
            if(event.target !== setupModal) return;
            setupModal.classList.toggle('hidden');

            if(setupModal.classList.contains('hidden')) return;
            vscode.postMessage({
              command: 'setupModalExit'
            })
          })
          const setupButton = document.getElementById('setupButton');
          setupButton.addEventListener('click', () => {
            setupModal.classList.toggle('hidden');
          });

          const setupOllamaApiUrlInput = document.getElementById('setupOllamaApiUrlInput');
          setupOllamaApiUrlInput.value = "${ollamaApiUrl}";
          setupOllamaApiUrlInput.addEventListener('input', () => {
            vscode.postMessage({
              command: 'setOllamaApiUrl',
              message: setupOllamaApiUrlInput.value
            })
          })

          const setupAiModelInput = document.getElementById('setupAiModelInput');
          setupAiModelInput.value = "${aiModel}";
          setupAiModelInput.addEventListener('input', () => {
            vscode.postMessage({
              command: 'setAiModel',
              message: setupAiModelInput.value
            })
          })

          window.addEventListener('message', event => {
            if (event.data.command === 'displayElement') {
              const element = event.data.element;
              const output = document.getElementById('output');
              output.innerHTML = element;
            }
          });
        })
      </script>
  </head>
  <body>
    <main class="flex flex-col items-center m-4 space-y-4">
      <div class="flex justify-between w-full">
        <div></div>

        <div class="flex space-x-2">
          <input
            class="py-2 px-4 border border-gray-300 rounded w-[20rem]"
            id="messageInput"
            type="text"
            placeholder="What element do you want to build?"
          />
          <button
            button
            id="createButton"
            class="bg-blue-500 text-white font-bold py-2 px-4 rounded cursor-pointer"
          >
            Create
          </button>
          <button
            button
            id="copyElementButton"
            class="bg-blue-500 text-white font-bold py-2 px-4 rounded cursor-pointer"
          >
            Copy Element
          </button>
        </div>

        <button
          button
          id="setupButton"
          class="bg-green-500 justify-self-end text-white font-bold py-2 px-4 rounded cursor-pointer"
        >
          Setup
        </button>
      </div>

      <div class="w-full h-[calc(100vh-200px)] flex-grow flex justify-center items-center" id="output">
        ${element}
      </div>
    </main>

    <div
      id="setupModal"
      class="absolute top-0 left-0 w-screen h-screen flex justify-center items-center bg-black/30 hidden"
    >
      <div class="flex flex-col p-4 w-fit rounded-md space-y-3 bg-slate-500">
        <div class="flex flex-col">
          <label for="setupOllamaApiUrlInput">Ollama API URL</label>
          <input
            class="py-2 px-4 border rounded w-[20rem]"
            id="setupOllamaApiUrlInput"
            type="text"
            placeholder="Ollama API URL"
          />
        </div>

        <div class="flex flex-col">
          <label for="setupAiModelInput">AI Model</label>
          <input
            class="py-2 px-4 border rounded w-[20rem]"
            id="setupAiModelInput"
            type="text"
            placeholder="AI Model"
          />
        </div>
      </div>
    </div>
  </body>
  </html>`;
}

async function runTailwind() {
  try {
    await execAsync("npm run build:tailwind", { cwd: __dirname });
    vscode.window.showInformationMessage("Tailwind CSS built successfully!");
    vscode.commands.executeCommand(
      "workbench.action.webview.reloadWebviewAction"
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error.message}`);
  }
}

module.exports = {
  activate,
  deactivate,
};
