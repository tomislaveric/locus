import { UploadDropzone } from "./upload-dropzone.js";
import { UploadFileRow } from "./upload-file-row.js";

export const VideoFileUpload = ({ file, optional = false }) => file
  ? UploadFileRow({ file, kind: "VIDEO FILE" })
  : UploadDropzone({
    id: optional ? "optional-video-file" : "video-file",
    name: "video",
    label: optional ? "Add video (optional)" : "Attach video",
    detail: optional ? "Add GoPro footage now or attach it later" : "Choose matching GoPro footage",
    accept: "video/mp4,.mp4",
    required: !optional
  });
