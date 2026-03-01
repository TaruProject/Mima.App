const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

async function analyzeImage() {
  try {
    const image = await loadImage('public/assets/mima-logo.jpg');
    console.log(`JPG size: ${image.width}x${image.height}`);
  } catch (e) {
    console.error(e);
  }
}

analyzeImage();
