const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

async function analyzeImage() {
  try {
    const image = await loadImage('public/assets/mima-logo.jpg');
    const canvas = createCanvas(80, 40);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, 80, 40);
    
    const imgData = ctx.getImageData(0, 0, 80, 40).data;
    
    let ascii = '';
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 80; x++) {
        const i = (y * 80 + x) * 4;
        const r = imgData[i];
        const g = imgData[i+1];
        const b = imgData[i+2];
        
        if (r > 200 && g > 200 && b > 200) {
          ascii += 'W'; // White
        } else if (r < 150 && g < 150 && b > 150) {
          ascii += 'P'; // Purple
        } else {
          ascii += '.'; // Other
        }
      }
      ascii += '\n';
    }
    
    console.log(ascii);
    
  } catch (e) {
    console.error(e);
  }
}

analyzeImage();
