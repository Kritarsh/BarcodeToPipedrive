import React from "react";
import ReactWebcam from "react-webcam";

function ImageUpload({
  showWebcam,
  setShowWebcam,
  webcamRef,
  sessionId,
  trackingNumber,
  apiUrl,
  setMessage,
}) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-white mb-2">
        Attach Image to Deal
      </h2>
      <button
        type="button"
        className="btn btn-secondary mb-2"
        onClick={() => setShowWebcam((prev) => !prev)}
      >
        {showWebcam ? "Hide Webcam" : "Use Webcam"}
      </button>
      {showWebcam && (
        <div className="mb-2">
          <ReactWebcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            width={320}
          />
          <button
            type="button"
            className="btn btn-accent mt-2"
            onClick={async () => {
              const imageSrc = webcamRef.current.getScreenshot();
              if (!imageSrc) {
                setMessage("Failed to capture image.");
                return;
              }
              const res = await fetch(imageSrc);
              const blob = await res.blob();
              const formData = new FormData();
              formData.append("image", blob, "webcam.jpg");
              formData.append("sessionId", sessionId);
              formData.append("trackingNumber", trackingNumber);

              try {
                await fetch(`${apiUrl}/api/upload-image`, {
                  method: "POST",
                  body: formData,
                });
                setMessage("Webcam image uploaded and attached to deal!");
              } catch (err) {
                setMessage("Failed to upload webcam image.");
              }
            }}
          >
            Capture & Upload
          </button>
        </div>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!trackingNumber) {
            setMessage("Scan a tracking number first.");
            return;
          }
          const fileInput = e.target.elements.imageFile;
          if (!fileInput.files[0]) {
            setMessage("Please select an image file.");
            return;
          }
          const formData = new FormData();
          formData.append("image", fileInput.files[0]);
          formData.append("sessionId", sessionId);
          formData.append("trackingNumber", trackingNumber);

          try {
            await fetch(`${apiUrl}/api/upload-image`, {
              method: "POST",
              body: formData,
            });
            setMessage("Image uploaded and attached to deal!");
          } catch (err) {
            setMessage("Failed to upload image.");
          }
        }}
      >
        <input
          type="file"
          name="imageFile"
          accept="image/*"
          className="mb-2"
        />
        <button type="submit" className="btn btn-info w-full">
          Upload Image
        </button>
      </form>
    </div>
  );
}

export default ImageUpload;