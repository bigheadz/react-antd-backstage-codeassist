const express = require("express");
const fs = require("fs-extra");
const path = require("path");
var exec = require("child-process-promise").exec;
// const util = require("util");

// const stat = util.promisify(fs.stat);
// const readdir = util.promisify(fs.readdir);

export default function openCode(app) {
  app.post("/codeAssist/openCode", async (req, res) => {
    let { target, line, column, workspace } = req.body;

    res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });

    if (!line) {
      line = 1;
    }
    if (!column) {
      column = 1;
    }
    workspace = workspace || "";
    try {
      if (
        workspace === "" ||
        !path.isAbsolute(workspace) ||
        !(await fs.pathExists(workspace))
      ) {
        res.end(JSON.stringify({ code: -1, error: "workspace参数不正确" }));
        return;
      }
      if (
        !target ||
        !path.isAbsolute(target) ||
        !(await fs.pathExists(target))
      ) {
        res.end(JSON.stringify({ code: -1, error: "target参数不正确" }));
        return;
      }
      const { stdout, stderr } = exec(
        `code ${workspace} -g ${target}:${line}:${column}`
      );
      console.log("openCode.stdout", stdout);
      console.log("openCode.stderr", stderr);
      res.end(JSON.stringify({ code: 0 }));
    } catch (e) {
      console.error("openCode", e);
      res.end(JSON.stringify({ code: -1, error: e.message }));
    }
  });

  app.post("/codeAssist/searchTag", async (req, res) => {
    let { tag, dir, workspace, rootTag } = req.body;

    console.log("/codeAssist/searchTag", { tag, dir, workspace, rootTag });

    res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });

    workspace = workspace || "";
    dir = dir || workspace;
    try {
      if (
        workspace === "" ||
        !path.isAbsolute(workspace) ||
        !(await fs.pathExists(workspace))
      ) {
        res.end(JSON.stringify({ code: -1, error: "workspace参数不正确" }));
        return;
      }

      if (!path.isAbsolute(dir) || !(await fs.pathExists(dir))) {
        res.end(JSON.stringify({ code: -1, error: "dir参数不正确" }));
        return;
      }

      let searchResult = null;

      if (rootTag && rootTag.length > 0) {
        const searchRootTagResult = await searchDir(dir, async (file) => {
          const ext = path.extname(file);
          if (
            [".js", ".jsx", ".ts", ".tsx", ".json", ".less", ".css"].indexOf(
              ext
            ) !== -1
          ) {
            return await searchFile(file, new RegExp(`tag: '${rootTag}'`));
          }
          return null;
        });
        console.log("searchRootTagResult", searchRootTagResult);
        if (searchRootTagResult) {
          dir = path.dirname(searchRootTagResult.file);
        }
      }
      if (searchResult === null)
        searchResult = await searchDir(dir, async (file) => {
          const ext = path.extname(file);

          if (
            [".js", ".jsx", ".ts", ".tsx", ".json", ".less", ".css"].indexOf(
              ext
            ) !== -1
          ) {
            return await searchFile(file, new RegExp(`${tag}( |$|\\*)`));
          }
          return null;
        });
      if (searchResult === null) {
        res.end(JSON.stringify({ code: -1, error: "未找到对应的tag" }));
        return;
      }
      // console.log("target file", file);
      const { file, line } = searchResult;
      const { stdout, stderr } = exec(`code ${workspace} -g ${file}:${line}`);
      console.log("openCode.stdout", stdout);
      console.log("openCode.stderr", stderr);

      res.end(JSON.stringify({ code: 0 }));
    } catch (e) {
      console.error("searchTag.error", e);
      res.end(JSON.stringify({ code: -1, error: "dir参数不正确" }));
    }
  });
}

async function searchFile(file, tagReg) {
  // 读取文件
  // 遍历每一行
  try {
    const data = await fs.readFile(file, "utf-8");
    let lineCount = 1;
    for (const line of data.split("\n")) {
      if (tagReg.test(line)) {
        return { file, line: lineCount };
      }
      lineCount++;
    }
    return null;
  } catch (e) {
    console.error("searchFile", file, e);
    return null;
  }
}

async function searchDir(filePath, searchFileCallback) {
  // console.log("searching", filePath);
  const info = await fs.stat(filePath);
  if (info.isDirectory()) {
    const baseName = path.basename(filePath);
    if (baseName === ".git" || baseName === "node_modules") {
      return;
    }
    const files = await fs.readdir(filePath);
    // console.log("files", files);
    for (const file of files) {
      const searchResult = await searchDir(
        path.join(filePath, file),
        searchFileCallback
      );
      if (searchResult) {
        return searchResult;
      }
    }
    return null;
  } else {
    const searchResult = await searchFileCallback(filePath);
    if (searchResult) {
      return searchResult;
    } else {
      return null;
    }
  }
}

// function readDir(dir) {
//   return new Promise((resolve, reject) => {
//     fs.readdir(dir, function (err, files) {
//       if (err) {
//         console.error("readDir", err);
//         return;
//       }
//       if (!files) return;
//       files.forEach(function (file) {
//         fs.stat(path.join(dir, file), function (err, info) {
//           if (err) {
//             console.error("stat", err);
//           }
//           if (info.isDirectory()) {
//             if (file === ".git" || file === "node_modules") {
//               resolve(null);
//               return;
//             }
//             console.log("dir: " + path.join(dir, file));
//             readDir(path.join(dir, file));
//           } else {
//             if (
//               file.endsWith(".ts") ||
//               file.endsWith(".tsx") ||
//               file.endsWith(".js") ||
//               file.endsWith(".jsx") ||
//               file.endsWith(".less") ||
//               file.endsWith(".css") ||
//               file.endsWith(".json")
//             ) {
//               // console.log("file: " + path.join(dir, file));
//             }
//           }
//         });
//       });
//     });
//   });
// }
