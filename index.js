#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const walk = require("walk");
const { Confirm, MultiSelect, Select } = require("enquirer");
const shell = require("shelljs");

const oldLog = console.log;
console.log = function (...args) {
  return oldLog(chalk.green(args));
};

const folders = [];
const files = [];

const options = {
  followLinks: false,
  // directories with these keys will be skipped
  filters: ["node_modules"],
};

function recursivelyFindServices() {
  const walker = walk.walk(".", options);
  console.log("Searching through directories for node services...");

  walker.on("file", function (root, stat, next) {
    if (stat.name === "package.json") {
      folders.push(root);
      console.log(root);
      const dirPath = root;
      const filePath = root + "/" + stat.name;
      const fileData = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const name = fileData.name;
      const startScripts = Object.keys(fileData.scripts).filter((name) => {
        if (name.includes("start")) {
          return name;
        }
      });
      files.push({
        name,
        startScripts,
        dirPath,
        value: name,
      });
    }
    next();
  });

  walker.on("end", function () {
    const prompt = new MultiSelect({
      name: "value",
      message: "Which services do you want to start?",
      limit: 7,
      choices: [...files],
    });

    prompt
      .run()
      .then((answers) => {
        selectedServices = files.filter(
          (file) => answers.indexOf(file.name) !== -1
        );
        let i = 0;
        askQuestion(i);
      })
      .catch(console.error);
  });
}

let selectedServices = [];

var askQuestion = function (i) {
  if (i < selectedServices.length) {
    const prompt = new Select({
      name: "value",
      message: `Which script do you want to run for ${selectedServices[i].name}?`,
      choices: [...selectedServices[i].startScripts],
    });
    i++;
    return prompt.run().then(function (answer) {
      selectedServices[i - 1].command = answer;
      return askQuestion(i);
    });
  } else {
    let commandsString = ``;
    selectedServices.forEach((service) => {
      commandsString += `"cd ${service.dirPath} && npm run ${service.command}" `;
    });
    fs.writeFileSync(
      path.join(__dirname, "previousCommands.json"),
      JSON.stringify({ mostRecent: commandsString })
    );
    shell.exec(`concurrently ${commandsString}`);
  }
};

try {
  if (fs.existsSync(path.join(__dirname, "previousCommands.json"))) {
    const { mostRecent } = JSON.parse(
      fs.readFileSync(path.join(__dirname, "previousCommands.json"))
    );
    const prompt = new Confirm({
      name: "question",
      message: "Want to go with your last config?",
      initial: "y",
    });

    prompt
      .run()
      .then((useLastConfig) => {
        if (useLastConfig) {
          shell.exec(`concurrently ${mostRecent}`);
        } else {
          recursivelyFindServices();
        }
      })
      .catch(console.error);
  } else {
    recursivelyFindServices();
  }
} catch (err) {
  console.error(err);
}
