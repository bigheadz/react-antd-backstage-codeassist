const express = require("express");
const fs = require("fs-extra");
const path = require("path");

export default function CopyCode(app) {
  app.post("/codeAssist/copyCode", async (req, res) => {
    let { src, target, tag, workspace, content } = req.body;
    console.log("/codeAssist/copyCode", { src, target, tag });

    res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });

    try {
      if (!path.isAbsolute(target)) {
        res.end(JSON.stringify({ code: -1, error: "目标文件参数不正确" }));
        return;
      }
      const targetStat = await fs.stat(target);
      if (!src && content) {
        // 表示复制的是内容， 那么target必须是一个文件
        if (targetStat.isDirectory()) {
          // 目标是文件夹， 无法复制， 报错
          res.end(JSON.stringify({ code: -1, error: "目标文件不能为文件夹" }));
          return;
        }
        // 如果target是文件, 或者不存在
        await fs.writeFile(target, content, "utf-8");
      } else {
        // 如果复制的是目录
        if (await fs.pathExists(target)) {
          res.end(JSON.stringify({ code: -1, error: "目标文件不为空" }));
          return;
        }
        if (!(await fs.pathExists(src))) {
          res.end(JSON.stringify({ code: -1, error: "源文件不存在" }));
          return;
        }
        await fs.copy(src, target, { overwrite: true, errorOnExist: true });
      }

      if (targetStat.isDirectory()) {
        if (!tag || tag.length === 0) {
          //  没有tag， 就生成一个随机字符串
          tag = `${Math.floor(Math.random() * 1000)}`;
        }
        console.log("tag", tag);

        await updateCode(target, tag, workspace);
      }
      res.end(JSON.stringify({ code: 0 }));
    } catch (e) {
      console.error("CopyCodeError", e);
      res.end(JSON.stringify({ code: -1, error: e.message }));
    }
  });
}

async function updateCode(target, tag, workspace) {
  const info = await fs.stat(target);
  if (info.isDirectory()) {
    const files = await fs.readdir(target);
    for (let file of files) {
      await updateCode(path.join(target, file), tag, workspace);
    }
  } else {
    // 更新下面的所有_codeAssist.ts名字的文件
    if (path.basename(target) === "_codeAssist.ts") {
      console.log("try update", target);
      await updateCodeInFile(target, tag, workspace);
    }
  }
}

async function updateCodeInFile(targetFile, tag, workspace) {
  let content = await fs.readFile(targetFile, "utf-8");
  // if (/^\/\/\s*(###[\w-]+)###\s*/.test(content)) {
  //   console.log("update file", targetFile);
  //   content = content.replace(/^\/\/\s*(###[\w-]+)###/, `// $1-${tag}###`);
  //   await fs.writeFile(targetFile, content, "utf-8");
  // }
  // tag: 'table-list',
  // 更新tag
  if (/tag:/.test(content)) {
    content = content.replace(/tag:\s*'([\w-]+)'/, `tag: '$1-${tag}'`);
  } else {
    throw new Error(`${targetFile} invalid, can't find tag: "...."`);
  }

  // 更新path
  if (/path:/.test(content)) {
    // 替换成相对于workspace的相对路径
    content = content.replace(
      /path:\s*'([\w/-]+)'/,
      `path: '${path
        .relative(workspace, path.dirname(targetFile))
        .replaceAll("\\", "/")}'`
    );
  } else {
    throw new Error(`${targetFile} invalid, can't find tag: "...."`);
  }

  // 更新modelNamespace
  if (/modelNamespace:/.test(content)) {
    // 替换成相对于workspace的相对路径
    content = content.replace(
      /modelNamespace:\s*'([\w-]+)'/,
      `modelNamespace: '$1-${tag}'`
    );
  }
  console.log("content", content);

  await fs.writeFile(targetFile, content, "utf-8");
}
