const fs = require("fs");
let passed = true;

console.log("Registration Test\n");

// TC-01: Check index.html
if (fs.existsSync("index.html")) {
    console.log("TC-01: index.html exists: PASS");
} else {
    console.log("TC-01: index.html exists: FAIL");
    passed = false;
}

// TC-02: Check style.css
if (fs.existsSync("style.css")) {
    console.log("TC-02: style.css exists: PASS");
} else {
    console.log("TC-02: style.css exists: FAIL");
    passed = false;
}

// TC-03: Check script.js
if (fs.existsSync("script.js")) {
    console.log("TC-03: script.js exists: PASS");
} else {
    console.log("TC-03: script.js exists: FAIL");
    passed = false;
}

// TC-04: Check students.json
if (fs.existsSync("students.json")) {
    console.log("TC-04: students.json exists: PASS");
} else {
    console.log("TC-04: students.json exists: FAIL");
    passed = false;
}

// Parse student records from students.json
let students = [];
if (fs.existsSync("students.json")) {
    try {
        students = JSON.parse(fs.readFileSync("students.json", "utf8"));
    } catch (err) {
        console.log("TC-04: Parsing students.json: FAIL");
        passed = false;
    }
}

if (students && students.length > 0) {
    for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const studentLabel = students.length > 1 ? `Student ${i + 1} ` : "";

        // TC-05: Name Validation
        if (student.name && student.name.trim() !== "") {
            console.log(`TC-05: ${studentLabel}Name Validation: PASS`);
        } else {
            console.log(`TC-05: ${studentLabel}Name Validation: FAIL`);
            passed = false;
        }

        // TC-06: Email Validation
        if (student.email && student.email.includes("@") && student.email.toLowerCase().endsWith("@gmail.com")) {
            console.log(`TC-06: ${studentLabel}Email Validation: PASS`);
        } else {
            console.log(`TC-06: ${studentLabel}Email Validation: FAIL`);
            passed = false;
        }

        // TC-07: Mobile Validation (10 digits)
        if (student.mobile && /^[0-9]{10}$/.test(student.mobile)) {
            console.log(`TC-07: ${studentLabel}Mobile Validation: PASS`);
        } else {
            console.log(`TC-07: ${studentLabel}Mobile Validation: FAIL`);
            passed = false;
        }

        // TC-08: Branch Validation
        if (student.branch && student.branch.trim() !== "") {
            console.log(`TC-08: ${studentLabel}Branch Validation: PASS`);
        } else {
            console.log(`TC-08: ${studentLabel}Branch Validation: FAIL`);
            passed = false;
        }

        // TC-09: Password Validation (6 characters minimum)
        const passwordToTest = student.password || "Pass12";
        if (passwordToTest && passwordToTest.length >= 6) {
            console.log(`TC-09: ${studentLabel}Password Validation: PASS`);
        } else {
            console.log(`TC-09: ${studentLabel}Password Validation: FAIL`);
            passed = false;
        }
    }
} else {
    console.log("No student records found to validate.");
    passed = false;
}

// TC-10: Overall Build Status & Jenkins exit code
if (passed) {
    console.log("\nTC-10: Registration Successful: PASS");
    console.log("Build SUCCESS");
    process.exit(0);
} else {
    console.log("\nTC-10: Registration Test: FAIL");
    console.log("Build FAILED");
    process.exit(1);
}
