const fs = require('fs');
const https = require('https');

const file = fs.createWriteStream("public/assets/mima-logo.jpg");
https.get("https://me.mima-app.com/assets/mima-logo.jpg", function(response) {
  response.pipe(file);
  file.on("finish", () => {
    file.close();
    console.log("Download Completed");
  });
});
