import CopyCode from "./copyCode";
import openCode from "./openCode";
import addUrl from "./updateConfig";

const express = require("express");
const bodyParser = require("body-parser");
const app = express();

export default function startServers() {
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());

  CopyCode(app);
  openCode(app);
  addUrl(app);

  const server = app.listen(8099, function () {
    const host = server.address().address;
    const port = server.address().port;

    console.log("应用实例，访问地址为 http://%s:%s", host, port);
  });
}

startServers();
