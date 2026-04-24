import { bech32 } from "https://cdn.jsdelivr.net/npm/@scure/base@1.1.1/+esm";
import { uploadFile } from "https://cdn.jsdelivr.net/npm/nostr-build@0.2.1/+esm";
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11.12.4/+esm";
import {
  init as initNostrLogin,
  logout as logoutNostrLogin,
} from "https://cdn.jsdelivr.net/npm/nostr-login@1.5.2/+esm";

const Bech32MaxSize = 5000;
const defaultNostrichImage = "https://i.nostr.build/jYXRE.jpg";
const canvas = document.getElementById("canvas");
const fontSizeSelect = document.getElementById("font-size-select");
const uploadButton = document.getElementById("upload-button");
const resultImage = document.getElementById("result-image");
const previewFrame = document.querySelector("[data-preview]");
const generateButton = document.getElementById("generate-button");
const state = {
  authorName: "",
  authorImageUrl: "",
  quote: "",
  noteUrl: "",
};

if (!window.nostr) {
  initNostrLogin({
    noBanner: false,
    darkMode: true,
    methods: ["connect", "local", "extension"],
  });
}

function showResult() {
  resultImage.style.display = "block";
  if (previewFrame) previewFrame.dataset.state = "ready";
  uploadButton.style.display = "inline-flex";
}

function setBusy(isBusy) {
  if (!generateButton) return;
  generateButton.disabled = isBusy;
  generateButton.dataset.loading = isBusy ? "true" : "false";
  if (previewFrame && isBusy) previewFrame.dataset.state = "loading";
}

uploadButton.addEventListener("click", async () => {
  if (!resultImage.src.startsWith("data:image")) {
    return Swal.fire("image has already been uploaded to nostr.build");
  }

  canvas.toBlob(async (blob) => {
    const file = new File([blob], "quotestr.png");
    const sign = (event) => window.nostr.signEvent(event);

    try {
      uploadButton.disabled = true;
      uploadButton.dataset.loading = "true";

      const { nip94_event: nip94Event } = await uploadFile({
        file,
        sign,
      });
      const nostrBuildImgSrc = nip94Event.tags.find(
        (t) => t[0] === "url",
      )?.[1];

      if (nostrBuildImgSrc) {
        resultImage.src = nostrBuildImgSrc;
      }

      Swal.fire({
        title: "Success",
        text: "You can now right-click the image to copy the nostr.build URL",
        icon: "success",
      });
    } catch (err) {
      if (
        [
          "user rejected",
          "prompt was closed",
          "rejected by user",
        ].includes(err.message.toLowerCase())
      ) {
        return;
      }

      logoutNostrLogin();
      Swal.fire({
        title: "Error",
        text: err.message || "Something went wrong :(",
        icon: "error",
      });
    } finally {
      uploadButton.disabled = false;
      uploadButton.dataset.loading = "false";
    }
  });
});

async function imageUrlToBlob(imageUrl) {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }

  return response.blob();
}

async function loadImage(url) {
  try {
    const blob = await imageUrlToBlob(url);

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = URL.createObjectURL(blob);
    });
  } catch (err) {
    const blob = await imageUrlToBlob(defaultNostrichImage);

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = URL.createObjectURL(blob);
    });
  }
}

function drawText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let lines = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;

    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeight;
      lines++;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
  lines++;

  return lines;
}

function applyGrayscale(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    data[i] = avg;
    data[i + 1] = avg;
    data[i + 2] = avg;
  }

  ctx.putImageData(imageData, 0, 0);
}

async function generateQRCode(text) {
  return new Promise((resolve, reject) => {
    QRCode.toDataURL(text, { width: 100, margin: 1 }, (err, url) => {
      if (err) {
        reject(err);
      } else {
        resolve(url);
      }
    });
  });
}

async function drawQuoteImage({
  canvas,
  ctx,
  imageUrl,
  author,
  quote,
  noteUrl,
  quoteFontSize,
}) {
  const image = await loadImage(imageUrl);

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const targetHeight = 600;
  const targetWidth = image.width * (targetHeight / image.height);
  const offsetX = (400 - targetWidth) / 2;

  ctx.drawImage(image, offsetX, 0, targetWidth, targetHeight);

  applyGrayscale(ctx, 400, targetHeight);

  ctx.fillStyle = "black";
  ctx.fillRect(400, 0, 400, 600);
  ctx.textAlign = "center";
  ctx.font = `${quoteFontSize}px "Source Serif 4", serif`;
  ctx.fillStyle = "white";

  const textX = 600;
  const textY = 120;
  const maxWidth = 360;
  const lineHeight = quoteFontSize + 8;
  const authorFontSize = quoteFontSize * 0.75;

  const quoteLines = quote.split("\n");
  let totalLines = 0;

  quoteLines.forEach((line, index) => {
    const lines = drawText(
      ctx,
      line,
      textX,
      textY + totalLines * lineHeight,
      maxWidth,
      lineHeight,
    );
    totalLines += lines;
  });

  ctx.font = `italic ${authorFontSize}px "Source Serif 4", serif`;
  ctx.fillStyle = "white";

  drawText(
    ctx,
    `— ${author}`,
    textX,
    totalLines * lineHeight + textY + authorFontSize * 0.5,
    maxWidth,
    lineHeight,
  );

  const qrCodeUrl = await generateQRCode(noteUrl);
  const qrImage = new Image();
  qrImage.src = qrCodeUrl;
  qrImage.onload = () => {
    const qrSize = 100;
    ctx.drawImage(
      qrImage,
      canvas.width - qrSize - 20,
      canvas.height - qrSize - 20,
      qrSize,
      qrSize,
    );

    resultImage.src = canvas.toDataURL("image/jpeg");
    showResult();
  };
}

async function getNote(noteId) {
  try {
    return await fetch(`https://nostrstuff.com/api/notes/${noteId}`).then(
      (res) => res.json(),
    );
  } catch (err) {
    return null;
  }
}

function extractAuthorValues(profile) {
  const defaultName = "Anonymous";
  const defaultValues = {
    author: defaultName,
    imageUrl: defaultNostrichImage,
  };

  if (!profile) {
    return defaultValues;
  }

  try {
    const { display_name, displayName, name, picture } = JSON.parse(
      profile.content,
    );

    return {
      author: display_name || displayName || name || defaultName,
      imageUrl: picture,
    };
  } catch (err) {
    return defaultValues;
  }
}

function matchAll(text, regex) {
  const matches = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1]);
  }

  return matches;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function parseTLV(data) {
  let result = {};
  let rest = data;
  while (rest.length > 0) {
    let t = rest[0];
    let l = rest[1];
    if (!l) throw new Error(`malformed TLV ${t}`);
    let v = rest.slice(2, 2 + l);
    rest = rest.slice(2 + l);
    if (v.length < l)
      throw new Error(`not enough data to read on TLV ${t}`);
    result[t] = result[t] || [];
    result[t].push(v);
  }
  return result;
}

function decode(nip19Id) {
  let { prefix, words } = bech32.decode(nip19Id, Bech32MaxSize);
  let data = new Uint8Array(bech32.fromWords(words));

  switch (prefix) {
    case "nprofile": {
      let tlv = parseTLV(data);
      if (!tlv[0]?.[0]) throw new Error("missing TLV 0 for nprofile");
      if (tlv[0][0].length !== 32)
        throw new Error("TLV 0 should be 32 bytes");

      return bytesToHex(tlv[0][0]);
    }
    case "npub":
      return bytesToHex(data);
    default:
      throw new Error(`unknown prefix ${prefix}`);
  }
}

function extractMentionIds(content) {
  const userIdRegex =
    /(?:nostr:|@)?(npub1[023456789acdefghjklmnpqrstuvwxyz]{58}|nprofile1[023456789acdefghjklmnpqrstuvwxyz]{61,})/g;

  return matchAll(content, userIdRegex).map((nip19Id) => ({
    pubkey: decode(nip19Id),
    nip19Id,
  }));
}

function buildUserProfilesUrl(userIds) {
  const params = new URLSearchParams();

  userIds.forEach((item) => {
    params.append("userId", item);
  });

  return `https://nostrstuff.com/api/users?${params.toString()}`;
}

async function getUserProfiles(userIds) {
  const url = buildUserProfilesUrl(userIds);

  try {
    const profiles = await fetch(url).then((res) => res.json());

    return Object.fromEntries(
      profiles.map((item) => [item.pubkey, item]),
    );
  } catch (err) {
    return [];
  }
}

function getUserName(profile) {
  const { name } = JSON.parse(profile.content);

  return name;
}

function normalizeQuote(content, mentionIdMap) {
  let result = content;

  Object.entries(mentionIdMap).forEach(([nip19Id, profile]) => {
    const re = new RegExp(`(nostr:|@)?${nip19Id}`, "g");

    if (profile) {
      result = result.replace(re, `@${getUserName(profile)}`);
    }
  });

  result = result.replace(/(\n*)https?:\/\/\S+(\n*)/gi, "");

  result = result.replace(
    /(\n*)(?:nostr:|@)?(note1[023456789acdefghjklmnpqrstuvwxyz]{58}|nevent1[023456789acdefghjklmnpqrstuvwxyz]{61,})(\n*)/g,
    "",
  );

  return result;
}

function isZapReceiptEvent(event) {
  return event.kind === 9735;
}

function getZapEvent(event) {
  try {
    return JSON.parse(event.tags.find((t) => t[0] === "description")[1]);
  } catch (err) {
    return null;
  }
}

function getContent(event) {
  return isZapReceiptEvent(event)
    ? getZapEvent(event).content
    : event.content;
}

function getAuthorPubkey(event) {
  return isZapReceiptEvent(event)
    ? getZapEvent(event).pubkey
    : event.pubkey;
}

async function getDataFromEvent(event) {
  const content = getContent(event);
  const authorPubkey = getAuthorPubkey(event);
  const mentionIds = extractMentionIds(content);
  const profiles = await getUserProfiles([
    authorPubkey,
    ...mentionIds.map(({ nip19Id }) => nip19Id),
  ]);
  const { author, imageUrl } = extractAuthorValues(
    profiles[authorPubkey],
  );
  const mentionIdMap = {};

  mentionIds.forEach(({ pubkey, nip19Id }) => {
    mentionIdMap[nip19Id] = profiles[pubkey];
  });

  const quote = normalizeQuote(content, mentionIdMap);

  return { author, imageUrl, quote };
}

function getCtx() {
  return canvas.getContext("2d", { willReadFrequently: true });
}

document
  .getElementById("quote-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const noteId = formData
      .get("noteId")
      .trim()
      .replace(/^nostr:/, "");

    if (!noteId) {
      return Swal.fire({
        icon: "error",
        title: "Error",
        text: "Please enter a valid Nostr nevent or note ID.",
      });
    }

    setBusy(true);

    const ctx = getCtx();
    const nostrEvent = await getNote(noteId);

    if (!nostrEvent) {
      setBusy(false);
      if (previewFrame && previewFrame.dataset.state === "loading") {
        previewFrame.dataset.state = resultImage.src ? "ready" : "empty";
      }

      return Swal.fire({
        icon: "error",
        title: "Error",
        text: `Couldn't find Nostr note with ID ${noteId}. Contact NotBiebs and tell him this shit sucks.`,
      });
    }

    const { author, imageUrl, quote } =
      await getDataFromEvent(nostrEvent);
    const authorImageUrl = `https://nostrstuff.com/api/proxy?url=${imageUrl}`;
    const noteUrl = `https://nostr.com/${noteId}`;
    const quoteFontSize = Number(fontSizeSelect.value);

    await drawQuoteImage({
      canvas,
      ctx,
      imageUrl: authorImageUrl,
      author,
      quote,
      noteUrl,
      quoteFontSize,
    });

    setBusy(false);

    state.authorName = author;
    state.authorImageUrl = authorImageUrl;
    state.quote = quote;
    state.noteUrl = noteUrl;
  });

fontSizeSelect.addEventListener("change", (event) => {
  if (
    !state.authorName ||
    !state.authorImageUrl ||
    !state.quote ||
    !state.noteUrl
  ) {
    return;
  }

  return drawQuoteImage({
    canvas,
    ctx: getCtx(),
    imageUrl: state.authorImageUrl,
    author: state.authorName,
    quote: state.quote,
    noteUrl: state.noteUrl,
    quoteFontSize: Number(event.target.value),
  });
});
