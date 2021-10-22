/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
const fs = require("fs");
const path = require("path");
const child_process = require("child_process");

function getFileNames(stagedFilesOnly) {
  // Grab only staged files, otherwise grab all files changed relative to main/master
  const diffCommand = "git diff --name-only " + (stagedFilesOnly ? "--staged" : "main");
  return child_process.execSync(diffCommand)
    .toString()
    .split("\n")
    // Append path name, accidentally "double counts" directory names between this file and root
    .map(f => path.join(__dirname, "..", f))
    .filter(f => /\.(js|ts|tsx|scss|css)$/.test(f));
}

function getCopyrightBanner(useCRLF) {
  const eol = (useCRLF) ? "\r\n" : "\n";
  return `/*---------------------------------------------------------------------------------------------${eol}* Copyright (c) Bentley Systems, Incorporated. All rights reserved.${eol}* See LICENSE.md in the project root for license terms and full copyright notice.${eol}*--------------------------------------------------------------------------------------------*/${eol}`;
}

const longCopyright = "/?/[*](.|\n|\r\n)*?Copyright(.|\n|\r\n)*?[*]/(\n|\r\n)";
const shortCopyright = "//\\s*Copyright.*\n";
const oldCopyrightBanner = RegExp(
  `^(${longCopyright})|(${shortCopyright})`,
  "m"
);

// If '--branch' is passed in all files changed since main/master will be linted
// otherwise only currently staged files will be linted
const filePaths = getFileNames(!process.argv.includes("--branch"))

if (filePaths) {
  filePaths.forEach((filePath) => {
    let fileContent = fs.readFileSync(filePath, { encoding: "utf8" });
    const lastNewlineIdx = fileContent.lastIndexOf("\n");
    const copyrightBanner = getCopyrightBanner(lastNewlineIdx > 0 && fileContent[lastNewlineIdx - 1] === "\r");

    if (fileContent.startsWith(copyrightBanner))
      return;

    fileContent = fileContent.replace(
      oldCopyrightBanner,
      copyrightBanner
    );
    if (!fileContent.includes(copyrightBanner)) {
      fileContent = copyrightBanner + fileContent;
    }
    fs.writeFileSync(filePath, fileContent);
  });
}