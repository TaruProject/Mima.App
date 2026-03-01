const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

async function analyzeImage() {
  try {
    const image = await loadImage('public/assets/mima-logo.png');
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    
    const imgData = ctx.getImageData(0, 0, image.width, image.height).data;
    
    let purpleMinX = image.width, purpleMinY = image.height, purpleMaxX = 0, purpleMaxY = 0;
    let whiteMinX = image.width, whiteMinY = image.height, whiteMaxX = 0, whiteMaxY = 0;
    
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const i = (y * image.width + x) * 4;
        const r = imgData[i];
        const g = imgData[i+1];
        const b = imgData[i+2];
        const a = imgData[i+3];
        
        if (a > 0) {
          if (r < 150 && g < 150 && b > 150) { // Purple
            if (x < purpleMinX) purpleMinX = x;
            if (x > purpleMaxX) purpleMaxX = x;
            if (y < purpleMinY) purpleMinY = y;
            if (y > purpleMaxY) purpleMaxY = y;
          } else if (r > 200 && g > 200 && b > 200) { // White
            if (x < whiteMinX) whiteMinX = x;
            if (x > whiteMaxX) whiteMaxX = x;
            if (y < whiteMinY) whiteMinY = y;
            if (y > whiteMaxY) whiteMaxY = y;
          }
        }
      }
    }
    
    console.log(`Purple bounding box: minX=${purpleMinX}, minY=${purpleMinY}, maxX=${purpleMaxX}, maxY=${purpleMaxY}`);
    console.log(`White bounding box: minX=${whiteMinX}, minY=${whiteMinY}, maxX=${whiteMaxX}, maxY=${whiteMaxY}`);
    
  } catch (e) {
    console.error(e);
  }
}

analyzeImage();
