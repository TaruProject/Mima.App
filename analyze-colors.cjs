const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

async function analyzeImage() {
  try {
    const image = await loadImage('public/assets/mima-logo.png');
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    
    const imgData = ctx.getImageData(0, 0, image.width, image.height).data;
    const colors = {};
    
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const i = (y * image.width + x) * 4;
        const r = imgData[i];
        const g = imgData[i+1];
        const b = imgData[i+2];
        const a = imgData[i+3];
        
        if (a > 0) {
          const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          colors[hex] = (colors[hex] || 0) + 1;
        }
      }
    }
    
    const sortedColors = Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log('Top colors:');
    sortedColors.forEach(c => console.log(`${c[0]}: ${c[1]} pixels`));
    
  } catch (e) {
    console.error(e);
  }
}

analyzeImage();
