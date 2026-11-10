const { isSherpaLocalProvider } = require("./parakeetModelInfo");

const LOCAL_MODEL_NOT_DOWNLOADED = "LOCAL_MODEL_NOT_DOWNLOADED";

// Whether the model a local meeting would transcribe with is on disk. A meeting
// must not start (and record audio nothing can transcribe) without it.
function isLocalMeetingModelAvailable({ provider, model, parakeetManager, whisperManager }) {
  try {
    return isSherpaLocalProvider(provider)
      ? Boolean(parakeetManager.isModelDownloaded(model))
      : Boolean(whisperManager.isModelDownloaded(model));
  } catch {
    return false;
  }
}

function localMeetingModelFailure(model) {
  return {
    success: false,
    code: LOCAL_MODEL_NOT_DOWNLOADED,
    error: `Local model "${model}" is not downloaded. Download it in Settings before recording.`,
  };
}

// Returns a start failure when the model is missing, else null.
function checkLocalMeetingStart(args) {
  return isLocalMeetingModelAvailable(args) ? null : localMeetingModelFailure(args.model);
}

module.exports = {
  LOCAL_MODEL_NOT_DOWNLOADED,
  isLocalMeetingModelAvailable,
  checkLocalMeetingStart,
};
