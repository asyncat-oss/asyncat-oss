import Busboy from "busboy";

// Maximum file size (10MB)
const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || 10 * 1024 * 1024;

// Allowed MIME types (you can customize this list)
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/zip",
];

// Parse multipart form data and handle file uploads
const parseFormData = (req) => {
  return new Promise((resolve, reject) => {
    // Check if content type contains multipart/form-data
    if (
      !req.headers["content-type"] ||
      !req.headers["content-type"].includes("multipart/form-data")
    ) {
      // Return regular JSON body with no files
      return resolve({
        fields: req.body,
        files: [],
      });
    }

    const fields = {};
    const files = [];

    // Create Busboy instance
    const busboy = Busboy({ headers: req.headers });

    // Handle fields
    busboy.on("field", (fieldname, val) => {
      fields[fieldname] = val;
    });

    // Handle files
    busboy.on("file", (fieldname, file, info) => {
      const { filename, encoding, mimeType } = info;

      const chunks = [];

      // Collect file data chunks
      file.on("data", (data) => {
        chunks.push(data);
      });

      // When file is completely read
      file.on("end", () => {
        // Combine chunks into a single buffer
        const buffer = Buffer.concat(chunks);

        // Add file to files array
        files.push({
          fieldname,
          originalname: filename,
          encoding,
          mimetype: mimeType,
          buffer,
          size: buffer.length,
        });
      });
    });

    // Handle end of form parsing
    busboy.on("finish", () => {
      resolve({ fields, files });
    });

    // Handle errors
    busboy.on("error", (err) => {
      reject(new Error(`Error parsing form data: ${err.message}`));
    });

    // Pipe request to busboy
    req.pipe(busboy);
  });
};

export default {
  parseFormData,
};
