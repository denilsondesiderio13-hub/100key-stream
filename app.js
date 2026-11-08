
const socket = io();
const $ = id => document.getElementById(id);
const sections = ["home", "hostStage", "viewerStage"];

let roomId = null;
let stream = null;
let hostPeers = new Map();
let viewerPc = null;
let hostSocketId = null;
let viewerJoined = false;

const show = id => sections.forEach(s =>
  $(s).classList.toggle("hidden", s !== id)
);

const toast = msg => {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
};

const makeRoom = () =>
  "100K-" + Math.random().toString(36).slice(2, 7).toUpperCase();

const roomFrom = value => {
  const s = value.trim();
  const m = s.match(/(?:watch\/|room=)([A-Za-z0-9-]+)/i);
  return (m ? m[1] : s).replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
};

const sendSignal = (target, data) =>
  socket.emit("signal", { target, data });

function addChat(target, author, message) {
  const box = $(target);
  if (!box) return;

  const line = document.createElement("div");
  line.className = "chat-line";

  const b = document.createElement("b");
  b.textContent = author;

  line.append(b, document.createTextNode(message));
  box.append(line);
  box.scrollTop = box.scrollHeight;
}

function bindChat(formId, inputId, target) {
  $(formId).onsubmit = e => {
    e.preventDefault();

    const message = $(inputId).value.trim();
    if (!message) return;

    socket.emit("chat-message", {
      code: roomId,
      message
    });

    $(inputId).value = "";
  };
}

// CRIAR SALA
$("createRoom").onclick = () => {
  roomId = roomFrom(
    prompt("Escolha um código para sua sala (deixe em branco para gerar automaticamente):") || ""
  ) || makeRoom();

  const password = prompt("Defina uma senha obrigatória para sua sala:");

  if (password === null || !password.trim()) {
    toast("É obrigatório definir uma senha.");
    return;
  }

  $("hostRoomCode").textContent = roomId;
  $("hostPasswordLabel").textContent = "SENHA: PROTEGIDA";

  socket.emit("host-register", {
    code: roomId,
    password: password.trim()
  });

  show("hostStage");
  bindChat("hostChatForm", "hostChatInput", "hostChat");
};

$("showJoin").onclick = () =>
  $("joinPanel").classList.toggle("hidden");

// ENTRAR NA SALA
$("joinRoom").onclick = () => {
  const id = roomFrom($("roomInput").value);

  if (!id) {
    toast("Informe o código ou link da sala.");
    return;
  }

  location.href = "/watch/" + encodeURIComponent(id);
};

// COPIAR LINK
$("copyLink").onclick = async () => {
  const url = location.origin + "/watch/" + roomId;

  try {
    await navigator.clipboard.writeText(url);
    toast("Link da sala copiado!");
  } catch {
    prompt("Copie o link da sala:", url);
  }
};

// COMPARTILHAMENTO
$("startShare").onclick = async () => {
  try {
    const height = Number($("quality").value);

    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: {
          ideal: height === 1440 ? 2560 : height === 1080 ? 1920 : 1280
        },
        height: { ideal: height },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: true
    });

    $("hostPreview").srcObject = stream;
    $("hostPlaceholder").classList.add("hidden");
    $("hostStatus").textContent = "● AO VIVO";
    $("startShare").classList.add("hidden");
    $("stopShare").classList.remove("hidden");

    stream.getVideoTracks()[0].addEventListener("ended", stopSharing);

    for (const [id] of hostPeers) {
      await createOfferFor(id);
    }

  } catch (e) {
    toast(
      e.name === "NotAllowedError"
        ? "Compartilhamento cancelado."
        : "Não foi possível iniciar a captura de tela."
    );
  }
};

async function createOfferFor(viewerId) {
  if (!stream || hostPeers.has(viewerId)) return;

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  hostPeers.set(viewerId, pc);

  stream.getTracks().forEach(t => pc.addTrack(t, stream));

  pc.onicecandidate = e => {
    if (e.candidate) {
      sendSignal(viewerId, {
        type: "ice",
        candidate: e.candidate
      });
    }
  };

  pc.onconnectionstatechange = () => {
    if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
      pc.close();
      hostPeers.delete(viewerId);
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  sendSignal(viewerId, {
    type: "offer",
    sdp: pc.localDescription
  });
}

function stopSharing() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }

  hostPeers.forEach(pc => pc.close());
  hostPeers.clear();

  $("hostPreview").srcObject = null;
  $("hostPlaceholder").classList.remove("hidden");
  $("hostStatus").textContent = "● TRANSMISSÃO ENCERRADA";
  $("startShare").classList.remove("hidden");
  $("stopShare").classList.add("hidden");
}

$("stopShare").onclick = stopSharing;

$("backHome").onclick = () => {
  stopSharing();
  show("home");
};

$("leaveRoom").onclick = () => {
  if (viewerPc) viewerPc.close();
  location.href = "/";
};

$("fullscreen").onclick = () => {
  const v = $("viewerVideo");
  if (v.requestFullscreen) v.requestFullscreen();
};

// CONEXÃO DO ESPECTADOR
function connectViewer() {
  if (viewerJoined) return;

  const password = $("viewerPassword").value.trim();

  if (!password) {
    toast("Digite a senha da sala!");
    $("viewerPassword").focus();
    return;
  }

  viewerJoined = true;

  $("viewerConnect").disabled = true;

  socket.emit("viewer-join", {
    code: roomId,
    password: password,
    name: $("viewerName").value
  });
}

$("viewerConnect").onclick = connectViewer;

$("viewerPassword").addEventListener("keydown", e => {
  if (e.key === "Enter") connectViewer();
});

// EVENTOS DO SERVIDOR
socket.on("host-ready", () => {
  toast("Sala criada. Compartilhe o link com os espectadores.");
});

socket.on("viewer-joined", async ({ viewerId }) => {
  if (stream) {
    await createOfferFor(viewerId);
  } else {
    toast("Um espectador entrou. Inicie o compartilhamento.");
  }
});

socket.on("room-update", data => {
  $("viewerCount").textContent =
    `${data.viewers.length} espectador(es) conectado(s)`;

  const list = $("viewerList");
  list.replaceChildren();

  if (!data.viewers.length) {
    list.textContent = "Aguardando espectadores...";
    return;
  }

  data.viewers.forEach(v => {
    const chip = document.createElement("span");
    chip.className = "viewer-chip";

    const label = document.createElement("span");
    label.textContent = v.name;

    const kick = document.createElement("button");
    kick.textContent = "Remover";

    kick.onclick = () => {
      socket.emit("host-kick", {
        code: roomId,
        viewerId: v.id
      });
    };

    chip.append(label, kick);
    list.append(chip);
  });
});

// ACESSO CONFIRMADO
socket.on("room-waiting", () => {
  $("viewerStatus").textContent = "● AGUARDANDO";
  $("viewerCredentials").classList.add("hidden");
  $("viewerConnect").disabled = false;
});

// ERRO DE SENHA OU SALA
socket.on("room-error", msg => {
  toast(msg);

  $("viewerStatus").textContent = "● VERIFIQUE O ACESSO";
  $("viewerCredentials").classList.remove("hidden");
  $("viewerConnect").disabled = false;

  viewerJoined = false;
});

socket.on("host-left", () => {
  $("viewerStatus").textContent = "● TRANSMISSOR SAIU";
  $("viewerPlaceholder").classList.remove("hidden");
  $("viewerPlaceholder").querySelector("b").textContent =
    "Transmissão encerrada";
});

socket.on("kicked", () => {
  toast("Você foi removido desta sala.");
  setTimeout(() => location.href = "/", 1000);
});

socket.on("chat-message", ({ author, message }) => {
  addChat("hostChat", author, message);
  addChat("viewerChat", author, message);
});

// VÍDEO E SINALIZAÇÃO
socket.on("signal", async ({ from, data }) => {
  try {
    if (data.type === "offer") {
      hostSocketId = from;

      if (viewerPc) viewerPc.close();

      viewerPc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });

      viewerPc.ontrack = e => {
        $("viewerVideo").srcObject = e.streams[0];
        $("viewerPlaceholder").classList.add("hidden");
        $("viewerStatus").textContent = "● AO VIVO";
      };

      viewerPc.onicecandidate = e => {
        if (e.candidate) {
          sendSignal(hostSocketId, {
            type: "ice",
            candidate: e.candidate
          });
        }
      };

      await viewerPc.setRemoteDescription(data.sdp);

      const answer = await viewerPc.createAnswer();
      await viewerPc.setLocalDescription(answer);

      sendSignal(hostSocketId, {
        type: "answer",
        sdp: viewerPc.localDescription
      });

    } else if (data.type === "answer") {
      const pc = hostPeers.get(from);
      if (pc) await pc.setRemoteDescription(data.sdp);

    } else if (data.type === "ice") {
      const pc = viewerPc || hostPeers.get(from);
      if (pc) await pc.addIceCandidate(data.candidate);
    }

  } catch (e) {
    console.error(e);
    toast("Falha ao estabelecer a conexão de vídeo.");
  }
});

// ABRIR SALA
const pathMatch = location.pathname.match(/^\/watch\/([^/]+)/i);

if (pathMatch) {
  roomId = decodeURIComponent(pathMatch[1]).toUpperCase();

  $("viewerRoomCode").textContent = roomId;
  show("viewerStage");

  bindChat("viewerChatForm", "viewerChatInput", "viewerChat");
} else {
  show("home");
}
