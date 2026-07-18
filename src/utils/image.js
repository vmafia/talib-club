/**
 * Compresses an image file on the client side using HTML Canvas.
 * Convert to jpeg format and scale down to speed up uploads.
 * @param {File} file - The original image file
 * @param {Object} options - Compression options
 * @param {number} options.maxWidth - Maximum width of output image
 * @param {number} options.maxHeight - Maximum height of output image
 * @param {number} options.quality - JPEG quality from 0.0 to 1.0
 * @returns {Promise<File>} - Resolves with compressed File, or original if error/unsupported
 */
export function compressImage(file, { maxWidth = 1000, maxHeight = 1000, quality = 0.75 } = {}) {
  return new Promise((resolve) => {
    // Return original file if it's not a browser-supported image type
    if (!file || !file.type.startsWith("image/")) {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions preserving aspect ratio
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return resolve(file);
          }
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              try {
                if (blob) {
                  // Extract original base filename without extension
                  const lastDotIndex = file.name.lastIndexOf(".");
                  const baseName = lastDotIndex !== -1 ? file.name.substring(0, lastDotIndex) : file.name;
                  
                  const compressedFile = new File([blob], `${baseName}_compressed.jpg`, {
                    type: "image/jpeg",
                    lastModified: Date.now(),
                  });
                  resolve(compressedFile);
                } else {
                  resolve(file); // Fallback to original
                }
              } catch (blobErr) {
                console.error("Error in toBlob callback:", blobErr);
                resolve(file);
              }
            },
            "image/jpeg",
            quality
          );
        } catch (loadErr) {
          console.error("Error in img.onload:", loadErr);
          resolve(file);
        }
      };
      img.onerror = () => resolve(file); // Fallback to original
      img.src = event.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}
