const form = document.querySelector("#upload");
const status = document.querySelector("#status");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  status.textContent = "Uploading and processing...";
  try {
    const response = await fetch("/api/jobs", { method: "POST", body: new FormData(form) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    poll(body.token, button);
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    button.disabled = false;
  }
});

async function poll(token, button) {
  try {
    const response = await fetch(`/api/jobs/${token}`);
    const job = await response.json();
    if (!response.ok) throw new Error(job.error);
    if (job.state === "processing") {
      status.textContent = "Processing telemetry and rendering clip...";
      setTimeout(() => poll(token, button), 1500);
    } else if (job.state === "succeeded") {
      status.innerHTML = `Detected event at ${job.detectedVideoSecond.toFixed(3)} s. <a href="${job.downloadUrl}">Download clip</a>`;
      button.disabled = false;
    } else {
      throw new Error(job.error);
    }
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    button.disabled = false;
  }
}
