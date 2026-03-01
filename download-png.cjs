const fs = require('fs');
const https = require('https');

const file = fs.createWriteStream("public/assets/mima-logo.png");
https.get("https://me.mima-app.com/assets/mima-logo.png", function(response) {
  response.pipe(file);
  file.on("finish", () => {
    file.close();
    console.log("Download Completed");
  });
});
