const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

async function analyzeImage() {
  try {
    const image = await loadImage('public/assets/mima-logo.png');
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    
    console.log(`Image size: ${image.width}x${image.height}`);
    
    // Check corners and center
    const corners = [
      ctx.getImageData(0, 0, 1, 1).data,
      ctx.getImageData(image.width - 1, 0, 1, 1).data,
      ctx.getImageData(0, image.height - 1, 1, 1).data,
      ctx.getImageData(image.width - 1, image.height - 1, 1, 1).data,
    ];
    
    console.log('Corners (R,G,B,A):');
    corners.forEach((c, i) => console.log(`Corner ${i}: ${c[0]},${c[1]},${c[2]},${c[3]}`));
    
    const center = ctx.getImageData(Math.floor(image.width/2), Math.floor(image.height/2), 1, 1).data;
    console.log(`Center: ${center[0]},${center[1]},${center[2]},${center[3]}`);
    
    // Find the bounding box of the non-white area
    let minX = image.width, minY = image.height, maxX = 0, maxY = 0;
    const imgData = ctx.getImageData(0, 0, image.width, image.height).data;
    
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const i = (y * image.width + x) * 4;
        const r = imgData[i];
        const g = imgData[i+1];
        const b = imgData[i+2];
        const a = imgData[i+3];
        
        // If not white or transparent
        if (a > 0 && (r < 250 || g < 250 || b < 250)) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    
    console.log(`Content bounding box: minX=${minX}, minY=${minY}, maxX=${maxX}, maxY=${maxY}`);
    console.log(`Content size: ${maxX - minX + 1}x${maxY - minY + 1}`);
    console.log(`Scale needed to fill width: ${image.width / (maxX - minX + 1)}`);
    console.log(`Scale needed to fill height: ${image.height / (maxY - minY + 1)}`);
    
  } catch (e) {
    console.error(e);
  }
}

analyzeImage();
