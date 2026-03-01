const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

async function analyzeImage() {
  try {
    const image = await loadImage('public/assets/mima-logo.jpg');
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    
    const corners = [
      ctx.getImageData(0, 0, 1, 1).data,
      ctx.getImageData(image.width - 1, 0, 1, 1).data,
      ctx.getImageData(0, image.height - 1, 1, 1).data,
      ctx.getImageData(image.width - 1, image.height - 1, 1, 1).data,
    ];
    
    console.log('Corners (R,G,B,A):');
    corners.forEach((c, i) => console.log(`Corner ${i}: ${c[0]},${c[1]},${c[2]},${c[3]}`));
    
    // Check edge pixels
    const topEdge = ctx.getImageData(image.width/2, 0, 1, 1).data;
    console.log(`Top Edge: ${topEdge[0]},${topEdge[1]},${topEdge[2]},${topEdge[3]}`);
    
  } catch (e) {
    console.error(e);
  }
}

analyzeImage();
