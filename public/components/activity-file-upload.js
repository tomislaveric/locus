import { UploadDropzone } from "./upload-dropzone.js";
import { UploadFileRow } from "./upload-file-row.js";

export const ActivityFileUpload = (file) => file
  ? UploadFileRow({ file, kind: "ACTIVITY FILE" })
  : UploadDropzone({
    id: "activity-file",
    name: "fit",
    label: "Upload activity",
    detail: "Choose a FIT file from your device",
    accept: ".fit,application/octet-stream",
    required: true
  });
