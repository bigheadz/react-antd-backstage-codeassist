import express from "express";
// const fs = require("fs");
const fs = require("fs-extra");
const path = require("path");
var exec = require("child-process-promise").exec;
// const util = require("util");

// const stat = util.promisify(fs.stat);
// const readdir = util.promisify(fs.readdir);

export default function addUrl(app) {
  app.post("/codeAssist/addUrl", async (req, res) => {
    let { workspace, url, src, name } = req.body;

    console.log("addUrl", { workspace, url, src, name });

    res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });

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
      if (!url || !path.isAbsolute(url)) {
        res.end(JSON.stringify({ code: -1, error: "url参数不正确" }));
        return;
      }
      // 确定添加的路径， 如果是url多很多层的话， 就现早上一层的位置, 如果找到了已经是/这一层的话， 就寻找下面这行的位置来添加代码
      // codeAssist: please do not delete or modify this line
      let content = await fs.readFile(`${workspace}/config/config.ts`, "utf-8");
      let { content: newContent, line } = addInPath(
        content,
        url,
        name,
        src,
        workspace
      );
      await fs.writeFile(`${workspace}/config/config.ts`, newContent, "utf-8");

      // 跳转到对应的文件上去
      const { stdout, stderr } = exec(
        `code ${workspace} -g ${workspace}/config/config.ts:${line}`
      );
      console.log("openCode.stdout", stdout);
      console.log("openCode.stderr", stderr);
      res.end(JSON.stringify({ code: 0 }));
    } catch (e) {
      console.error("addUrl", e);
      // 跳转到对应的文件上去
      try {
        const { stdout, stderr } = exec(
          `code ${workspace} -g ${workspace}/config/config.ts`
        );
        console.log("openCode.stdout", stdout);
        console.log("openCode.stderr", stderr);
      } catch (e) {
        console.error("openCode", e);
      }

      res.end(JSON.stringify({ code: -1, error: e.message }));
    }
  });
}

function findPath(content, currentPath) {
  currentPath = currentPath.replace(/\\/gm, "/");
  if (currentPath.endsWith("/")) {
    currentPath = currentPath.substr(0, currentPath.length - 1);
  }

  if (currentPath === "/" || currentPath === "") {
    return "/";
  }

  // assert(!currentPath.endsWith("/"), "currentPath不能以/结束");
  // console.log("findPath", currentPath);
  let currentPathReg = currentPath.replace(/\//gm, "\\/");
  currentPathReg = `'${currentPathReg}\\/{0,1}'`;
  console.log("findPathReg", currentPathReg);

  if (new RegExp(currentPathReg).test(content)) {
    // 换成普通的路径
    return currentPath;
  } else {
    return findPath(content, path.join(currentPath, ".."));
  }
}

function updateContent(content, insertUrl, url, name, component, workspace) {
  // ...basicSamplesRouter从这个地方开始
  // 左侧的文字 $`, 右侧的文字 $'
  let lines;
  let targetLineCount = 1;
  if (insertUrl === "/") {
    let findInsertPlace = false;
    lines = content.split("\n").map((line, lineCount) => {
      if (
        /\/\/ codeAssist: please do not delete or modify this line/.test(line)
      ) {
        findInsertPlace = true;
        targetLineCount = lineCount + 1;
        line = line.replace(
          /(\/\/ codeAssist: please do not delete or modify this line)/,
          `{\n  ${
            name ? `$\`name: '${name}',` : `$\`// name: '',`
          }\n  $\`// icon: 'highlight',\n  $\`path: '${url}',\n  $\`component: './${component}',\n$\`},\n$\`// codeAssist: please do not delete or modify this line`
        );
      }
      return line;
    });
    content = lines.join("\n");
    if (!findInsertPlace) {
      throw new Error(
        "未找到相应的插入点， 请在代码中保留'// codeAssist: please do not delete or modify this line'的注释"
      );
    }
  } else {
    // 找到path: '/editor/somePage',类似的path， 向后查找对应的插入点

    lines = content.split("\n");
    const insertUrlReg = insertUrl.replace(/\//gm, "\\/");
    console.log("insertUrlReg", insertUrlReg);
    // 先找到最小的代码块在{}之间的部分
    const matchLine = content.match(
      new RegExp(`( *)path: '${insertUrlReg}\\/?'`, "gm")
    );
    const spaceNumber = matchLine[0].indexOf("p") - 2;
    console.log("spaceNumber", spaceNumber);
    // 查找匹配的{和匹配的}
    let indexStart = 0;
    let indexEnd = 0;
    let lineCount = 0;
    let indexPath = 0;
    let findUrl = false;
    let indexRoutes = 0;
    let indexRoutesEnd = 0;

    // 寻找包括insertUrlReg的{和}
    for (let line of lines) {
      // {
      if (!findUrl && new RegExp(`^ {${spaceNumber}}\\{`).test(line)) {
        indexStart = lineCount;
      }
      // path:
      if (
        indexStart > 0 &&
        new RegExp(`( *)path: '${insertUrlReg}\\/?'`).test(line)
      ) {
        indexPath = lineCount;
        findUrl = true;
      }
      if (findUrl && new RegExp(`^ {${spaceNumber}}\\}`).test(line)) {
        indexEnd = lineCount;
        break; // 如果已经找到了， 就不用继续查找下去了
      }
      lineCount++;
    }

    // 匹配里面的内容
    lineCount = 0;
    for (let line of lines) {
      if (lineCount < indexStart) {
        // 跳过外面的代码
        lineCount++;
        continue;
      }
      if (lineCount > indexEnd) {
        break;
      }
      // routes:
      if (new RegExp(` {${spaceNumber + 2}}routes: \\[`).test(line)) {
        indexRoutes = lineCount;
      }
      // routes: ...]
      if (indexStart > 0 && new RegExp(` {${spaceNumber + 2}}\\]`).test(line)) {
        indexRoutesEnd = lineCount;
      }
      lineCount++;
    }

    console.log(indexStart, indexPath, indexRoutesEnd, indexEnd);
    if (indexStart === 0 || indexPath === 0 || indexEnd === 0) {
      throw new Error("解析routes出错");
    }
    const findRoutes = indexRoutes > indexStart && indexRoutes < indexEnd;
    const section = lines
      .filter((l, i) => i >= indexStart && i <= indexEnd)
      .join("\n");
    console.log("section\n", section, "findRoutes", findRoutes);
    // 如果没有找到routes， 新建一个roues： 添加对应的代码
    if (!findRoutes) {
      lines = lines.map((l, i) => {
        if (i === indexEnd - 1) {
          return `${l}\n${nSpace(spaceNumber + 2)}routes: [\n${nSpace(
            spaceNumber + 4
          )}{\n${nSpace(spaceNumber + 6)}${
            name ? `name: '${name}'` : `// name: ''`
          },\n${nSpace(spaceNumber + 6)}// icon: 'highlight',\n${nSpace(
            spaceNumber + 6
          )}path: '${url}',\n${nSpace(
            spaceNumber + 6
          )}component: './${component}',\n${nSpace(
            spaceNumber + 4
          )}},\n${nSpace(spaceNumber + 2)}],`;
        }
        return l;
      });
      content = lines.join("\n");
    } else {
      lines = lines.map((l, i) => {
        if (i === indexRoutesEnd) {
          return `${nSpace(spaceNumber + 4)}{\n${nSpace(spaceNumber + 6)}${
            name ? `name: '${name}'` : `// name: ''`
          },\n${nSpace(spaceNumber + 6)}// icon: 'highlight',\n${nSpace(
            spaceNumber + 6
          )}path: '${url}',\n${nSpace(
            spaceNumber + 6
          )}component: './${component}',\n${nSpace(spaceNumber + 4)}},\n${l}`;
        }
        return l;
      });
      content = lines.join("\n");
    }
  }
  console.log("content will update to \n", content);
  return { content, line: targetLineCount };
}

function nSpace(number) {
  return new Array(number + 1).join(" ");
}

function addInPath(content, url, name, component, workspace) {
  const insertPath = findPath(content, url);
  console.log("parentPath", insertPath);
  if (
    insertPath === url ||
    insertPath === url + "/" ||
    insertPath + "/" === url
  ) {
    throw new Error("路径已经存在");
  }
  // 如果是 /
  // 如果是 /abc
  return updateContent(content, insertPath, url, name, component, workspace);
}
