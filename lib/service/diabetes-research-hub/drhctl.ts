#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-run --allow-net --allowffi

import * as colors from "https://deno.land/std@0.224.0/fmt/colors.ts";
import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
//import * as drhux from "./package.sql.ts";
import * as uvaUx from "./dataset-specific-package/dclp1-uva-study.sql.ts";
import { existsSync } from "https://deno.land/std/fs/mod.ts";

import {
  FlexibleTextSupplierSync,
  spawnedResult,
  textFromSupplierSync,
} from "../../universal/spawn.ts";

// Detect platform-specific command format
const isWindows = Deno.build.os === "windows";
const toolCmd = isWindows ? ".\\surveilr" : "surveilr";
const dbFilePath = "resource-surveillance.sqlite.db"; // Path to your SQLite DB

const RSC_BASE_URL =
  "https://raw.githubusercontent.com/surveilr/www.surveilr.com/main/lib/service/diabetes-research-hub";
// Setting up automation script with the default study dataset pattern as "UVA DCLP1".
//The package sql to be invoked will vary depending on different Dataset pattern
const UVA_SQL = "./dataset-specific-package/dclp1-uva-study.sql.ts";

// Helper function to fetch SQL content
async function fetchSqlContent(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch SQL content from ${url}`);
    }
    return response.text();
  } catch (error) {
    console.error(
      colors.cyan(`Error fetching SQL content from ${url}:`),
      error.message,
      
    );
    Deno.exit(1);
    return "";
    
  }
}

async function fetchFileContent(pathOrUrl: string): Promise<string> {
  try {
    if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
      // Handle remote URL
      const response = await fetch(pathOrUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch content from ${pathOrUrl}`);
      }
      return await response.text();
    } else {
      // Handle local file path
      return await Deno.readTextFile(pathOrUrl);
    }
  } catch (error) {
    console.error(
      colors.cyan(`Error accessing content from ${pathOrUrl}:`),
      error.message,
    );
    Deno.exit(1);
    return "";
  }
}

// Helper function to execute a command
async function executeCommand(
  cmd: string[],
  stdinSupplier?: FlexibleTextSupplierSync,
) {
  try {
    console.log(colors.dim(`Executing command: ${cmd.join(" ")}`));

    // Use spawnedResult for executing the command
    const result = await spawnedResult(
      cmd,
      undefined,
      stdinSupplier ? textFromSupplierSync(stdinSupplier) : undefined,
    );

    if (!result.success) {
      console.log(`Error ${result.stderr()}`);
      throw new Error(`Command failed with status ${result.code}`);
    }
  } catch (error) {
    console.error(
      colors.cyan(`Error executing command ${cmd.join(" ")}:`),
      error.message,
    );
    Deno.exit(1);
  }
}

// Function to check if a file exists and delete it if it does
async function checkAndDeleteFile(filePath: string) {
  try {
    const fileInfo = await Deno.stat(filePath);
    if (fileInfo.isFile) {
      console.log(colors.yellow(`File ${filePath} found. Deleting...`));
      await Deno.remove(filePath);
      console.log(colors.green(`File ${filePath} deleted.`));
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log(
        colors.green(`File ${filePath} not found. No action needed.`),
      );
    } else {
      console.error(
        colors.cyan(`Error checking or deleting file ${filePath}:`),
        error.message,
      );
      Deno.exit(1);
    }
  }
}

// Function to fetch UX SQL content
async function fetchUxSqlContent(): Promise<string> {
  try {
    //const uxSQLContent = await drhux.drhSQL();
    const uxSQLContent = await uvaUx.uvadclp1SQL();
    return uxSQLContent.join("\n");
  } catch (error) {
    console.error(
      colors.red("Error fetching UX SQL content:"),
      error.message,
    );
    return "";   
    //Deno.exit(1);
  }
}

// Function to execute SQL commands directly on SQLite database
function executeSqlCommands(sqlCommands: string): void {
  let db: Database | null = null; // Initialize db variable

  try {
    db = new Database(dbFilePath); // Open the database
    db.exec(sqlCommands); // Execute the SQL commands
    console.log(colors.green("SQL executed successfully."));
  } catch (error) {
    console.error(colors.red("Error executing SQL commands:"), error.message);
    Deno.exit(1);
  } finally {
    if (db) {
      db.close(); // Close the database if it was opened
    }
  }
}

// Function to check for table existence and create combined view
async function checkAndCreateCombinedView(dbFilePath: string) {
  const db = new Database(dbFilePath);

  try {
    const tableName = "uniform_resource_cgm_file_metadata";    
    // Check if the required table exists
    const stmt = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    );    
    const rows = stmt.all(tableName);


    if (rows.length > 0) {
      console.log(
        colors.green(
          "Required table exists. Proceeding to create the combined view.",
        ),
      );      
      await createCombinedCGMView(dbFilePath); // Ensure this function is defined elsewhere
    } else {
      console.error(
        colors.red(
          "The required table does not exist. Cannot create the combined view.",
        ),
      );      
    }
  } catch (error) {
    console.error(
      colors.red("Error in checkAndCreateCombinedView:"),
      error.message,
    );    
  } finally {
    db.close();
  }
}

/// Function to check if a folder exists and list its contents
async function checkFolderContents(pathOrUrl: string): Promise<void> {
  try {
    // Trim spaces from the path
    pathOrUrl = pathOrUrl.trim();

    // Check if the path contains spaces
    if (/\s/.test(pathOrUrl)) {
      console.error(
        colors.red(
          `Error: The specified path "${pathOrUrl}" should not contain spaces.`,
        ),
      );
      Deno.exit(1);
    }

    // Check if the path exists
    if (!existsSync(pathOrUrl)) {
      console.error(
        colors.red(`Error: The specified folder "${pathOrUrl}" does not exist.`),
      );
      Deno.exit(1);
    }

    // Handle local directory
    const entries = Deno.readDir(pathOrUrl); // Use async readDir
    console.log(
      colors.cyan(`Verifying the Contents of folder "${pathOrUrl}"....`),
    );
    let validFilesFound = false; // Flag to check for valid file types

    for await (const entry of entries) {
      if (entry.isFile) {
        const fileExtension = entry.name.split(".").pop()?.toLowerCase();
        //console.log(colors.green(`File: ${entry.name}`));
        //console.log(colors.dim(`Type: ${fileExtension}`));

        // Check if the file type is valid
        if (
          ["csv", "txt", "pdf", "xls", "xlsx"].includes(fileExtension || "")
        ) {
          validFilesFound = true; // Mark valid file found
        }
      } else if (entry.isDirectory) {
        console.log(colors.yellow(`Directory: ${entry.name}`));
      }
    }

    // If no valid files were found, exit the script
    if (!validFilesFound) {
      console.error(
        colors.red(
          `No valid files (CSV, TXT, PDF, XLS, XLSX) found in the folder "${pathOrUrl}".`,
        ),
      );
      Deno.exit(1);
    }
  } catch (error) {
    console.error(
      colors.red(`Error checking folder contents from "${pathOrUrl}":`),
      error.message,
    );
    Deno.exit(1);
  }
}

// Check if a folder name was provided
if (Deno.args.length === 0) {
  console.error(
    colors.cyan("No folder name provided. Please provide a folder name."),
  );
  Deno.exit(1);
}

// Store the folder name in a variable
const folderName = Deno.args[0];

// Check for folder contents
await checkFolderContents(folderName);


// Define synchronous suppliers
// const deidentificationSQLSupplier: FlexibleTextSupplierSync = () =>
//   deidentificationSQL;
// const vvSQLSupplier: FlexibleTextSupplierSync = () => vvSQL;
// const uxSQLSupplier: FlexibleTextSupplierSync = () => uxSQL;
const uvaSQLSupplier: FlexibleTextSupplierSync = () => uvaSQL;

// let deidentificationSQL: string;
// let vvSQL: string;
// let uxSQL: string;
let uvaSQL: string;

try {
  // Fetch SQL content for DeIdentification, Verification & Validation, and UX orchestration
  // deidentificationSQL = await fetchSqlContent(
  //   `${RSC_BASE_URL}/de-identification/drh-deidentification.sql`,
  // );
  // vvSQL = await fetchSqlContent(
  //   `${RSC_BASE_URL}/verfication-validation/orchestrate-drh-vv.sql`,
  // );
  // uxSQL = await fetchSqlContent(
  //   `${UX_URL}/package.sql`,
  // );
  //uvaSQL = await fetchFileContent(UVA_SQL);
  uvaSQL = await fetchUxSqlContent();
  //uxSQL = await fetchUxSqlContent(); // Fetch UX SQL content
} catch (error) {
  console.error(
    colors.cyan(
      "Error fetching SQL contents for DeIdentification and Verification & Validation:",
    ),
    error.message,
  );
  Deno.exit(1);
}

// Check and delete the file if it exists
await checkAndDeleteFile(dbFilePath);


// Log the start of the process
console.log(colors.cyan(`Starting the process for folder: ${folderName}`));

try {
  console.log(colors.dim(`Ingesting files from folder: ${folderName}...`));
  await executeCommand([toolCmd, "ingest", "files", "-r", `${folderName}/`]);
} catch (error) {
  console.error(colors.cyan("Error ingesting files:"), error.message);
  Deno.exit(1);
}

try {
  await executeCommand([toolCmd, "orchestrate", "transform-csv"]);
  console.log(
    colors.green("Files ingestion and CSV transformation successful."),
  );
} catch (error) {
  console.error(colors.cyan("Error transforming CSV files:"), error.message);
  Deno.exit(1);
}

try {
  console.log(colors.dim(`Performing UX orchestration: ${folderName}...`));
  //await executeCommand([toolCmd, "shell"], uxSQLSupplier);
  await executeCommand([toolCmd, "shell"], uvaSQLSupplier);
  //executeSqlCommands(uvaSQL); // Execute UX SQL commands
  console.log(colors.green("UX orchestration completed successfully."));
} catch (error) {
  console.error(colors.cyan("Error during UX orchestration:"), error.message);
  Deno.exit(1);
}

try {
  console.log(
    colors.green(
      `Loading DRH Edge UI... at http://localhost:9000/drh/index.sql`,
    ),
  );
  await executeCommand([toolCmd, "web-ui", "--port", "9000"]);
} catch (error) {
  console.error(colors.cyan("Error starting DRH Edge UI:"), error.message);
  Deno.exit(1);
}
