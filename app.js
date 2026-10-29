const KEY = "aquafresh_gudang_v1",
        AUTH_KEY = "aquafresh_auth_session",
        today = () => new Date().toISOString().slice(0, 10);

      const seed = {
        items: [
          {
            id: 1,
            code: "AM-600",
            name: "Air Mineral 600 ml",
            size: "600 ml",
            perBox: 24,
            minBox: 20,
            pcs: 0,
            boxes: 0,
          },
          {
            id: 2,
            code: "AM-1500",
            name: "Air Mineral 1500 ml",
            size: "1500 ml",
            perBox: 12,
            minBox: 15,
            pcs: 0,
            boxes: 0,
          },
          {
            id: 3,
            code: "AM-330",
            name: "Air Mineral 330 ml",
            size: "330 ml",
            perBox: 24,
            minBox: 10,
            pcs: 0,
            boxes: 0,
          },
        ],
        customers: [
          {
            id: 4,
            code: "TOK-001",
            name: "Toko Sejahtera",
            contact: "0812-0000-0000",
            address: "Jl. Raya Industri No. 12",
          },
        ],
        tx: [],
        nextId: 5,
        nextTx: 1,
      };

      const defaultUsers = [
        {
          id: 1,
          name: "Admin Gudang",
          username: "admin",
          password: "admin",
          role: "Super Admin",
          createdAt: "2026-10-14",
        },
        {
          id: 2,
          name: "Operator Lapangan",
          username: "operator",
          password: "123",
          role: "Operator Produksi",
          createdAt: "2026-10-14",
        },
      ];

      const API_URL = "https://aquafresh-api.gizzanadifa.workers.dev";

      // --- 1. Definisi Kelas LCG (dari Modul 5) ---
      class LCG {
        constructor(seed, a = 1664525, c = 1013904223, m = 2 ** 32) {
          this.state = seed;
          this.a = a;
          this.c = c;
          this.m = m;
        }

        next() {
          this.state = (this.a * this.state + this.c) % this.m;
          return this.state / this.m;
        }

        reset(seed) {
          this.state = seed;
        }
      }

      // --- 2. Contoh Penggunaan di Fitur Gudang ---
      // Misalnya untuk mensimulasikan jumlah stok masuk secara acak antara 10 sampai 100 unit
      function simulasiStokMasuk(seedAwal) {
        const rng = new LCG(seedAwal);
        const randomFaktor = rng.next();

        const min = 10;
        const max = 100;
        const estimasiStok = Math.floor(min + randomFaktor * (max - min + 1));

        return estimasiStok;
      }

      function generateBatchCode(prefix = "BATCH", digits = 6) {
        const seedValue = Math.abs(Math.floor(Date.now() + Math.random() * 1_000_000));
        const rng = new LCG(seedValue);
        const min = 10 ** (digits - 1);
        const max = 10 ** digits - 1;
        const randomInt = Math.floor(rng.next() * (max - min + 1)) + min;
        return `${prefix}-${randomInt}`;
      }

      function fillBatchTarget(targetId, prefix = "BATCH") {
        const field = document.getElementById(targetId);
        if (!field) return;
        field.value = generateBatchCode(prefix);
      }

      function bindBatchGenerators() {
        const simulationButton = document.getElementById("btnSimulasiBatch");
        const simulationText = document.getElementById("textBatch");

        if (simulationButton && simulationText) {
          simulationButton.addEventListener("click", () => {
            const batch = generateBatchCode("BATCH");
            simulationText.textContent = batch;
            console.log("Berhasil generate batch:", batch);
          });
        }

        document.querySelectorAll("[data-batch-target]").forEach((button) => {
          button.addEventListener("click", () => {
            const targetId = button.dataset.batchTarget;
            const prefix = button.dataset.batchPrefix || "BATCH";
            fillBatchTarget(targetId, prefix);
          });
        });
      }

      const seedBarang = 12345;
      console.log("Simulasi jumlah stok masuk:", simulasiStokMasuk(seedBarang));

      function initDB() {
        try {
          const raw = localStorage.getItem(KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            return {
              items:
                Array.isArray(parsed.items) && parsed.items.length
                  ? parsed.items
                  : seed.items,
              customers:
                Array.isArray(parsed.customers) && parsed.customers.length
                  ? parsed.customers
                  : seed.customers,
              tx: Array.isArray(parsed.tx) ? parsed.tx : [],
              users:
                Array.isArray(parsed.users) && parsed.users.length
                  ? parsed.users
                  : defaultUsers,
              nextId: parsed.nextId || 10,
              nextTx: parsed.nextTx || 1,
              deletedServerIds: Array.isArray(parsed.deletedServerIds)
                ? parsed.deletedServerIds
                : [],
              deletedServerCustIds: Array.isArray(parsed.deletedServerCustIds)
                ? parsed.deletedServerCustIds
                : [],
            };
          }
        } catch (e) {
          console.error("Gagal membaca localStorage", e);
        }
        return {
          ...seed,
          users: defaultUsers,
          deletedServerIds: [],
          deletedServerCustIds: [],
        };
      }

      let db = initDB();

      function updateSyncUI(status, message) {
        const el = $("syncStatusBadge");
        if (!el) return;
        if (status === "syncing") {
          el.className = "sync-badge syncing";
          el.innerHTML = "🔄 Menyinkronkan...";
          el.title = "Sedang menghubungi server Cloudflare...";
        } else if (status === "success") {
          el.className = "sync-badge online";
          el.innerHTML = "🟢 Cloudflare Terhubung";
          el.title = message || "Data tersinkronisasi dengan Cloudflare D1";
        } else if (status === "error") {
          el.className = "sync-badge offline";
          el.innerHTML = "🟡 Mode Offline / Lokal";
          el.title =
            message ||
            "Gagal sinkron ke Cloudflare. Data tetap tersimpan di lokal browser.";
        }
      }

      async function loadData() {
        updateSyncUI("syncing");
        try {
          const response = await fetch(API_URL + "/items", {
            cache: "no-store",
          });
          if (!response.ok) throw new Error("Status " + response.status);
          const serverItems = await response.json();

          if (Array.isArray(serverItems)) {
            const activeServer = serverItems.filter(
              (si) => !(db.deletedServerIds || []).includes(si.id),
            );

            const merged = [...db.items];
            activeServer.forEach((si) => {
              const existingIdx = merged.findIndex(
                (mi) =>
                  mi.id === si.id ||
                  (mi.code &&
                    mi.code.trim().toUpperCase() ===
                      si.code.trim().toUpperCase()),
              );
              if (existingIdx !== -1) {
                const cur = merged[existingIdx];
                merged[existingIdx] = {
                  ...cur,
                  id: si.id,
                  code: si.code,
                  name: si.name,
                  size: si.size,
                  perBox:
                    si.perBox !== undefined && si.perBox !== null && !isNaN(Number(si.perBox))
                      ? Number(si.perBox)
                      : (cur.perBox || 24),
                  minBox:
                    si.minBox !== undefined && si.minBox !== null && !isNaN(Number(si.minBox))
                      ? Number(si.minBox)
                      : (cur.minBox !== undefined ? cur.minBox : 0),
                  pcs: cur.pcs !== undefined ? cur.pcs : Number(si.pcs) || 0,
                  boxes:
                    cur.boxes !== undefined ? cur.boxes : Number(si.boxes) || 0,
                };
              } else {
                merged.push({
                  id: si.id,
                  code: si.code,
                  name: si.name,
                  size: si.size,
                  perBox: Number(si.perBox) || 24,
                  minBox:
                    si.minBox !== undefined && si.minBox !== null && !isNaN(Number(si.minBox))
                      ? Number(si.minBox)
                      : 0,
                  pcs: Number(si.pcs) || 0,
                  boxes: Number(si.boxes) || 0,
                });
              }
            });

            db.items = merged;
          }

          try {
            const custRes = await fetch(API_URL + "/customers", {
              cache: "no-store",
            });
            if (custRes.ok) {
              const serverCusts = await custRes.json();
              if (Array.isArray(serverCusts)) {
                const activeCusts = serverCusts.filter(
                  (sc) => !(db.deletedServerCustIds || []).includes(sc.id),
                );
                const mergedCusts = [...db.customers];
                activeCusts.forEach((sc) => {
                  const idx = mergedCusts.findIndex(
                    (mc) =>
                      mc.id === sc.id ||
                      (mc.code &&
                        mc.code.trim().toUpperCase() ===
                          sc.code.trim().toUpperCase()),
                  );
                  if (idx !== -1) {
                    mergedCusts[idx] = {
                      ...mergedCusts[idx],
                      id: sc.id,
                      code: sc.code,
                      name: sc.name,
                      contact: sc.contact || "",
                      address: sc.address || "",
                    };
                  } else {
                    mergedCusts.push({
                      id: sc.id,
                      code: sc.code,
                      name: sc.name,
                      contact: sc.contact || "",
                      address: sc.address || "",
                    });
                  }
                });

                for (const localCust of db.customers) {
                  const onServer = activeCusts.some(
                    (sc) =>
                      sc.code &&
                      sc.code.trim().toUpperCase() ===
                        localCust.code.trim().toUpperCase(),
                  );
                  if (!onServer && localCust.code && localCust.name) {
                    fetch(API_URL + "/customers", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(localCust),
                    }).catch(() => {});
                  }
                }

                db.customers = mergedCusts;
              }
            }
          } catch (e) {
            console.warn("Gagal load customers dari Cloudflare:", e);
          }

          save();
          updateSyncUI("success");
        } catch (err) {
          console.warn(
            "Sinkronisasi server belum terhubung, menggunakan data lokal:",
            err,
          );
          updateSyncUI("error", "Gagal menghubungi server Cloudflare");
        }
        refresh();
      }

      function getCurrentUser() {
        try {
          const raw =
            sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY);
          return raw ? JSON.parse(raw) : null;
        } catch (e) {
          return null;
        }
      }

      function checkAuth() {
        const user = getCurrentUser();
        const screen = $("loginScreen");
        if (!user) {
          if (screen) screen.style.display = "flex";
          return false;
        }
        if (screen) screen.style.display = "none";
        if ($("currentUserName")) $("currentUserName").textContent = user.name;
        if ($("currentUserRole")) $("currentUserRole").textContent = user.role;
        return true;
      }

      function login(username, password, remember) {
        if (!db.users) db.users = defaultUsers;
        const u = db.users.find(
          (x) =>
            x.username.toLowerCase() === username.trim().toLowerCase() &&
            x.password === password,
        );
        if (!u) {
          const errEl = $("loginError");
          if (errEl) {
            errEl.textContent = "Username atau password salah!";
            errEl.style.display = "block";
          }
          return false;
        }
        const sessionData = {
          id: u.id,
          username: u.username,
          name: u.name,
          role: u.role,
        };
        if (remember) {
          localStorage.setItem(AUTH_KEY, JSON.stringify(sessionData));
        } else {
          sessionStorage.setItem(AUTH_KEY, JSON.stringify(sessionData));
        }
        if ($("loginError")) $("loginError").style.display = "none";
        if ($("loginScreen")) $("loginScreen").style.display = "none";
        checkAuth();
        toast("Selamat datang, " + u.name + "!");
        return true;
      }

      function logout() {
        if (confirm("Apakah Anda yakin ingin keluar dari sistem?")) {
          sessionStorage.removeItem(AUTH_KEY);
          localStorage.removeItem(AUTH_KEY);
          checkAuth();
          toast("Anda telah keluar");
        }
      }

      function fillLogin(u, p) {
        $("loginUsername").value = u;
        $("loginPassword").value = p;
        $("loginUsername").focus();
      }

      function handleLoginSubmit(e) {
        e.preventDefault();
        const u = $("loginUsername").value;
        const p = $("loginPassword").value;
        const remember = $("loginRemember").checked;
        login(u, p, remember);
      }

      const $ = (id) => document.getElementById(id),
        fmt = (n) => Number(n || 0).toLocaleString("id-ID"),
        esc = (s) =>
          String(s ?? "").replace(
            /[&<>"']/g,
            (c) =>
              ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
              })[c],
          ),
        item = (id) => db.items.find((x) => x.id === Number(id)),
        customer = (id) => db.customers.find((x) => x.id === Number(id));

      function toast(s) {
        $("toast").textContent = s;
        $("toast").style.display = "block";
        setTimeout(() => ($("toast").style.display = "none"), 2600);
      }

      function save() {
        localStorage.setItem(KEY, JSON.stringify(db));
        refresh();
      }

      function showPage(n, updateHistory = true) {
        if (!n) n = "dashboard";
        const targetPage = $("page-" + n);
        document
          .querySelectorAll(".page")
          .forEach((x) => x.classList.remove("active"));
        if (targetPage) {
          targetPage.classList.add("active");
        } else {
          n = "dashboard";
          $("page-dashboard")?.classList.add("active");
        }
        document
          .querySelectorAll(".nav[data-page]")
          .forEach((x) => x.classList.toggle("active", x.dataset.page === n));
        $("side")?.classList.remove("open");
        selects();
        if (n === "akun") renderUsers();
        if (updateHistory) {
          try {
            history.replaceState(null, "", "#" + n);
            localStorage.setItem("aquafresh_active_page", n);
          } catch (e) {}
        }
      }

      function initNavigation() {
        document
          .querySelectorAll(".nav[data-page]")
          .forEach((b) => (b.onclick = () => showPage(b.dataset.page)));
        $("menu").onclick = () => $("side")?.classList.toggle("open");

        const initialPage =
          window.location.hash.replace("#", "").trim() ||
          localStorage.getItem("aquafresh_active_page") ||
          "dashboard";
        showPage(initialPage, false);

        window.addEventListener("hashchange", () => {
          const p = window.location.hash.replace("#", "").trim();
          if (p) showPage(p, false);
        });
      }

      function selects() {
        ["prodItem", "packItem", "inItem", "outItem"].forEach((id) => {
          let e = $(id);
          if (!e) return;
          let old = e.value;
          e.innerHTML = db.items
            .map(
              (i) =>
                `<option value="${i.id}">${esc(i.code)} — ${esc(i.name)}</option>`,
            )
            .join("");
          if ([...e.options].some((o) => o.value === old)) e.value = old;
        });
        let c = $("outCustomer");
        if (c) {
          let old = c.value;
          c.innerHTML =
            '<option value="">Pilih toko...</option>' +
            db.customers
              .map((x) => `<option value="${x.id}">${esc(x.name)}</option>`)
              .join("");
          if ([...c.options].some((o) => o.value === old)) c.value = old;
        }
        preview();
      }

      function tx(i, type, date, change, note) {
        const record = {
          id: db.nextTx++,
          date,
          type,
          code: i.code,
          itemName: i.name,
          change,
          note,
        };
        db.tx.push(record);

        fetch(API_URL + "/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record),
        }).catch((e) => console.warn("Gagal kirim transaksi ke server:", e));
      }

      function pill(t) {
        return `<span class="pill">${esc(t)}</span>`;
      }

      function renderItems() {
        let q = ($("searchItems")?.value || "").toLowerCase(),
          a = db.items.filter((i) =>
            (i.code + i.name + i.size).toLowerCase().includes(q),
          );
        $("itemsTable").innerHTML =
          a
            .map(
              (i) =>
                `<tr><td>${esc(i.code)}</td><td>${esc(i.name)}</td><td>${esc(i.size)}</td><td>${fmt(i.perBox)} pcs</td><td>${fmt(i.pcs)}</td><td><b>${fmt(i.boxes)}</b></td><td>${fmt(i.minBox)}</td><td><button class="btn small gray" onclick="openItem(${i.id})">Edit</button> <button class="btn small red" onclick="delItem(${i.id})">Hapus</button></td></tr>`,
            )
            .join("") ||
          '<tr><td colspan="8" class="empty">Belum ada barang.</td></tr>';
      }

      function renderCustomers() {
        $("customersTable").innerHTML =
          db.customers
            .map(
              (c) =>
                `<tr><td>${esc(c.code)}</td><td>${esc(c.name)}</td><td>${esc(c.contact)}</td><td>${esc(c.address)}</td><td><button class="btn small red" onclick="delCustomer(${c.id})">Hapus</button></td></tr>`,
            )
            .join("") ||
          '<tr><td colspan="5" class="empty">Belum ada toko.</td></tr>';
      }

      function renderTx() {
        let q = ($("txSearch")?.value || "").toLowerCase(),
          t = $("txType")?.value || "",
          a = [...db.tx]
            .reverse()
            .filter(
              (x) =>
                (!t || x.type === t) &&
                (x.itemName + x.code + x.note + x.type)
                  .toLowerCase()
                  .includes(q),
            );
        $("txTable").innerHTML =
          a
            .map(
              (x) =>
                `<tr><td>${esc(x.date)}</td><td>${pill(x.type)}</td><td>${esc(x.code)}</td><td>${esc(x.itemName)}</td><td>${esc(x.change)}</td><td>${esc(x.note || "-")}</td></tr>`,
            )
            .join("") ||
          '<tr><td colspan="6" class="empty">Belum ada transaksi.</td></tr>';
      }

      function renderStock() {
        let q = ($("stockSearch")?.value || "").toLowerCase();
        $("stockTable").innerHTML = db.items
          .filter((i) => (i.name + i.code).toLowerCase().includes(q))
          .map(
            (i) =>
              `<tr><td>${esc(i.code)}</td><td>${esc(i.name)}</td><td>${fmt(i.pcs)}</td><td>${fmt(i.boxes)}</td><td>${fmt(i.perBox)}</td><td>${fmt(i.minBox)}</td><td><span class="pill ${i.boxes < i.minBox ? "red" : "green"}">${i.boxes < i.minBox ? "Menipis" : "Aman"}</span></td></tr>`,
          )
          .join("");
      }

      function dashboard() {
        $("sku").textContent = fmt(db.items.length);
        $("boxes").textContent = fmt(db.items.reduce((s, i) => s + i.boxes, 0));
        $("pcs").textContent = fmt(db.items.reduce((s, i) => s + i.pcs, 0));
        $("low").textContent = fmt(
          db.items.filter((i) => i.boxes < i.minBox).length,
        );
        $("ships").textContent = fmt(
          db.tx.filter((t) => t.type === "Barang Keluar").length,
        );
        let a = db.items.filter((i) => i.boxes < i.minBox);
        $("lowTable").innerHTML =
          a
            .map(
              (i) =>
                `<tr><td>${esc(i.code)}</td><td>${esc(i.name)}</td><td style="color:#e5484d">${fmt(i.boxes)}</td><td>${fmt(i.minBox)}</td></tr>`,
            )
            .join("") ||
          '<tr><td colspan="4" class="empty">Tidak ada stok menipis.</td></tr>';
        let r = [...db.tx].reverse().slice(0, 6);
        $("recent").innerHTML =
          r
            .map(
              (t) =>
                `<tr><td>${esc(t.date)}</td><td>${pill(t.type)}</td><td>${esc(t.itemName)}</td><td>${esc(t.change)}</td><td>${esc(t.note || "-")}</td></tr>`,
            )
            .join("") ||
          '<tr><td colspan="5" class="empty">Belum ada transaksi.</td></tr>';
      }

      function refresh() {
        selects();
        renderItems();
        renderCustomers();
        renderTx();
        renderStock();
        renderUsers();
        dashboard();
      }

      function modal(title, html) {
        $("modalTitle").textContent = title;
        $("modalBody").innerHTML = html;
        $("modalbg").style.display = "flex";
      }

      function closeModal() {
        $("modalbg").style.display = "none";
      }

      $("modalbg").onclick = (e) => {
        if (e.target.id === "modalbg") closeModal();
      };

      function openItem(id) {
        let i = id ? item(id) : null;
        modal(
          i ? "Edit Barang" : "Tambah Master Barang",
          `<form id="itemForm">
            <div class="formgrid">
              <div class="field"><label>Kode SKU</label><input name="code" required value="${esc(i?.code || "")}" placeholder="AM-600"></div>
              <div class="field"><label>Nama Barang</label><input name="name" required value="${esc(i?.name || "")}" placeholder="Air Mineral 600 ml"></div>
              <div class="field"><label>Ukuran</label><input name="size" required value="${esc(i?.size || "")}" placeholder="600 ml"></div>
              <div class="field"><label>Isi kardus (pcs)</label><input name="perBox" type="number" min="1" required value="${i?.perBox || 24}"></div>
              <div class="field"><label>Minimum kardus</label><input name="minBox" type="number" min="0" required value="${i !== null && i.minBox !== undefined ? i.minBox : 0}"></div>
            </div>
            <p class="muted">${i ? "Perubahan akan disimpan ke Cloudflare D1 dan disinkronkan ke lokal." : "Barang akan disimpan ke Cloudflare D1 dan disinkronkan ke lokal."}</p>
            <button type="submit">${i ? "Simpan Perubahan" : "Simpan Barang"}</button>
          </form>`,
        );

        $("itemForm").onsubmit = async (e) => {
          e.preventDefault();
          let formData = new FormData(e.target);
          let v = {
            id: i ? i.id : undefined,
            code: formData.get("code").trim().toUpperCase(),
            name: formData.get("name").trim(),
            size: formData.get("size").trim(),
            perBox: Number(formData.get("perBox")),
            minBox: Number(formData.get("minBox")),
            pcs: i ? i.pcs : 0,
            boxes: i ? i.boxes : 0,
          };

          toast("Menyimpan ke Cloudflare...");

          try {
            const res = await fetch(API_URL + "/items", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(v),
            });
            const data = await res.json();
            if (data.success) {
              if (i) {
                Object.assign(i, v);
                toast("Perubahan berhasil tersimpan di Cloudflare!");
              } else {
                v.id = data.id || db.nextId++;
                db.items.push(v);
                toast("Master barang tersimpan di Cloudflare!");
              }
              save();
              closeModal();
              return;
            }
          } catch (err) {
            console.error("Gagal menyimpan item ke server:", err);
          }

          if (i) {
            Object.assign(i, v);
            save();
            toast("Barang diperbarui (Lokal)");
          } else {
            let tempItem = { id: db.nextId++, ...v };
            db.items.push(tempItem);
            save();
            toast("Tersimpan di database lokal (Offline)");
          }
          closeModal();
        };
      }

      async function delItem(id) {
        let i = item(id);
        if (!i) return;
        if (i.pcs || i.boxes) {
          toast("Stok masih ada; keluarkan stok sebelum menghapus");
          return;
        }
        if (confirm("Hapus " + i.name + "?")) {
          db.items = db.items.filter((x) => x.id !== id);
          if (!db.deletedServerIds) db.deletedServerIds = [];
          db.deletedServerIds.push(id);
          save();
          toast("Barang dihapus");

          try {
            await fetch(API_URL + "/items?id=" + id, { method: "DELETE" });
          } catch (e) {
            console.warn("Gagal delete item di Cloudflare:", e);
          }
        }
      }

      function renderUsers() {
        if (!$("usersTable")) return;
        const q = ($("userSearch")?.value || "").toLowerCase();
        const current = getCurrentUser();
        const list = (db.users || []).filter((u) =>
          (u.name + u.username + (u.role || "")).toLowerCase().includes(q),
        );
        $("usersTable").innerHTML =
          list
            .map((u, idx) => {
              const isSelf =
                current &&
                current.username.toLowerCase() === u.username.toLowerCase();
              return `<tr>
                <td>${idx + 1}</td>
                <td><b>${esc(u.name)}</b></td>
                <td><code>${esc(u.username)}</code></td>
                <td><span class="pill ${u.role && u.role.toLowerCase().includes("admin") ? "blue" : ""}">${esc(u.role || "Operator")}</span></td>
                <td>${esc(u.createdAt || "-")}</td>
                <td>
                  <button class="btn small gray" onclick="openResetPassword(${u.id})">Ganti Password</button>
                  ${isSelf ? '<span class="muted" style="font-size:11px;margin-left:6px;">(Sedang Aktif)</span>' : `<button class="btn small red" onclick="delUser(${u.id})">Hapus</button>`}
                </td>
              </tr>`;
            })
            .join("") ||
          '<tr><td colspan="6" class="empty">Belum ada akun pengguna.</td></tr>';
      }

      function openUserModal() {
        modal(
          "Tambah Akun Pengguna",
          `<form id="addUserForm">
            <div class="formgrid">
              <div class="field full">
                <label>Nama Lengkap</label>
                <input name="name" required placeholder="Contoh: Budi Santoso">
              </div>
              <div class="field">
                <label>Username (ID Login)</label>
                <input name="username" required placeholder="Contoh: budi" autocomplete="off">
              </div>
              <div class="field">
                <label>Password</label>
                <input name="password" type="password" required placeholder="Minimal 3 karakter" minlength="3">
              </div>
              <div class="field full">
                <label>Hak Akses / Peran</label>
                <select name="role" required>
                  <option value="Admin Gudang">Admin Gudang (Akses Penuh)</option>
                  <option value="Operator Lapangan">Operator Lapangan (Produksi & Packing)</option>
                  <option value="Staff Logistik">Staff Logistik (Barang Masuk & Keluar)</option>
                  <option value="Supervisor Gudang">Supervisor Gudang</option>
                </select>
              </div>
            </div>
            <br>
            <button type="submit" class="btn" style="width:100%;">Simpan Akun Baru</button>
          </form>`,
        );

        $("addUserForm").onsubmit = (e) => {
          e.preventDefault();
          const f = new FormData(e.target);
          const username = f.get("username").trim().toLowerCase();
          const name = f.get("name").trim();
          const password = f.get("password").trim();
          const role = f.get("role");

          if (!db.users) db.users = [];
          if (db.users.some((u) => u.username.toLowerCase() === username)) {
            return toast("Username '" + username + "' sudah digunakan!");
          }

          const newUser = {
            id: db.nextId++,
            name,
            username,
            password,
            role,
            createdAt: today(),
          };

          db.users.push(newUser);
          save();
          closeModal();
          toast("Akun " + name + " berhasil dibuat!");
          renderUsers();
        };
      }

      function openResetPassword(userId) {
        const u = (db.users || []).find((x) => x.id === userId);
        if (!u) return;
        modal(
          "Ganti Password - " + esc(u.name),
          `<form id="resetPwdForm">
            <p>Masukkan password baru untuk akun <b>${esc(u.username)}</b>:</p>
            <div class="field">
              <label>Password Baru</label>
              <input name="newPassword" type="password" required minlength="3" placeholder="Minimal 3 karakter">
            </div>
            <br>
            <button type="submit" class="btn">Perbarui Password</button>
          </form>`,
        );

        $("resetPwdForm").onsubmit = (e) => {
          e.preventDefault();
          const newPwd = new FormData(e.target).get("newPassword").trim();
          if (newPwd.length < 3) return toast("Password minimal 3 karakter");
          u.password = newPwd;
          save();
          closeModal();
          toast("Password untuk " + u.name + " berhasil diubah!");
        };
      }

      function delUser(userId) {
        const cur = getCurrentUser();
        const u = (db.users || []).find((x) => x.id === userId);
        if (!u) return;
        if (cur && cur.username.toLowerCase() === u.username.toLowerCase()) {
          return toast("Tidak dapat menghapus akun Anda sendiri!");
        }
        const admins = db.users.filter((x) =>
          (x.role || "").toLowerCase().includes("admin"),
        );
        if (
          admins.length <= 1 &&
          (u.role || "").toLowerCase().includes("admin")
        ) {
          return toast("Tidak dapat menghapus admin terakhir!");
        }
        if (
          confirm(
            "Yakin ingin menghapus akun " + u.name + " (" + u.username + ")?",
          )
        ) {
          db.users = db.users.filter((x) => x.id !== userId);
          save();
          toast("Akun dihapus");
          renderUsers();
        }
      }

      function openCustomer() {
        modal(
          "Tambah Toko",
          `<form id="custForm">
            <div class="formgrid">
              <div class="field"><label>Kode Toko</label><input name="code" required placeholder="TOK-002"></div>
              <div class="field"><label>Nama Toko</label><input name="name" required placeholder="Nama Toko / Mitra"></div>
              <div class="field"><label>Kontak</label><input name="contact" placeholder="08xx-xxxx-xxxx"></div>
              <div class="field"><label>Alamat</label><input name="address" placeholder="Alamat lengkap"></div>
            </div>
            <br>
            <button type="submit">Simpan Toko</button>
          </form>`,
        );
        $("custForm").onsubmit = async (e) => {
          e.preventDefault();
          let f = new FormData(e.target);
          let code = f.get("code").trim().toUpperCase();
          let name = f.get("name").trim();
          let contact = (f.get("contact") || "").trim();
          let address = (f.get("address") || "").trim();

          if (
            db.customers.some(
              (c) => c.code.toUpperCase() === code,
            )
          )
            return toast("Kode toko " + code + " sudah digunakan!");

          const newCust = {
            code,
            name,
            contact,
            address,
          };

          toast("Menyimpan ke Cloudflare...");
          try {
            const res = await fetch(API_URL + "/customers", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(newCust),
            });
            const data = await res.json();
            if (data.success) {
              newCust.id = data.id || db.nextId++;
              db.customers.push(newCust);
              save();
              toast("Toko berhasil disimpan ke Cloudflare!");
              closeModal();
              return;
            }
          } catch (err) {
            console.warn("Gagal simpan customer ke Cloudflare:", err);
          }

          newCust.id = db.nextId++;
          db.customers.push(newCust);
          save();
          toast("Toko tersimpan (Database Lokal)");
          closeModal();
        };
      }

      async function delCustomer(id) {
        let c = customer(id);
        if (!c) return;
        if (confirm("Hapus toko " + (c.name || "") + "?")) {
          db.customers = db.customers.filter((x) => x.id !== id);
          if (!db.deletedServerCustIds) db.deletedServerCustIds = [];
          db.deletedServerCustIds.push(id);
          save();
          toast("Toko dihapus");

          try {
            await fetch(API_URL + "/customers?id=" + id, { method: "DELETE" });
          } catch (e) {
            console.warn("Gagal hapus customer di Cloudflare:", e);
          }
        }
      }

      function preview() {
        if (!$("packPreview")) return;
        let i = item($("packItem")?.value),
          q = +$("packQty")?.value || 0;
        $("packPreview").textContent = i
          ? `Stok ${fmt(i.pcs)} pcs • Kebutuhan ${fmt(q * i.perBox)} pcs untuk ${fmt(q)} kardus • Sisa ${fmt(i.pcs - q * i.perBox)} pcs`
          : "Pilih barang untuk melihat kebutuhan pcs.";
      }

      $("packItem").onchange = preview;
      $("packQty").oninput = preview;

      function dates() {
        ["prodDate", "packDate", "inDate", "outDate"].forEach(
          (id) => ($(id).value = today()),
        );
      }

      $("productionForm").onsubmit = (e) => {
        e.preventDefault();
        let i = item($("prodItem").value),
          q = +$("prodQty").value;
        if (!i || q <= 0) return;
        i.pcs += q;
        tx(
          i,
          "Produksi Masuk",
          $("prodDate").value,
          "+" + fmt(q) + " pcs",
          [$("prodBatch").value, $("prodNote").value]
            .filter(Boolean)
            .join(" | ") || "Hasil produksi",
        );
        save();
        e.target.reset();
        dates();
        toast("Penerimaan produksi dicatat");
      };

      $("packingForm").onsubmit = (e) => {
        e.preventDefault();
        let i = item($("packItem").value),
          q = +$("packQty").value,
          need = q * i.perBox;
        if (!i || q <= 0) return;
        if (i.pcs < need)
          return toast(
            `Stok kurang: perlu ${fmt(need)} pcs, tersedia ${fmt(i.pcs)} pcs`,
          );
        i.pcs -= need;
        i.boxes += q;
        tx(
          i,
          "Packing",
          $("packDate").value,
          "+" + fmt(q) + " kardus / -" + fmt(need) + " pcs",
          [$("packBatch").value, $("packNote").value]
            .filter(Boolean)
            .join(" | ") || "Packing barang jadi",
        );
        save();
        e.target.reset();
        dates();
        toast("Packing berhasil disimpan");
      };

      $("inForm").onsubmit = (e) => {
        e.preventDefault();
        let i = item($("inItem").value),
          q = +$("inQty").value,
          u = $("inUnit").value;
        if (!i || q <= 0) return;
        if (u === "pcs") i.pcs += q;
        else i.boxes += q;
        tx(
          i,
          "Barang Masuk",
          $("inDate").value,
          "+" + fmt(q) + " " + u,
          $("inNote").value || "Penerimaan barang",
        );
        save();
        e.target.reset();
        dates();
        toast("Barang masuk dicatat");
      };

      $("outForm").onsubmit = (e) => {
        e.preventDefault();
        let i = item($("outItem").value),
          c = customer($("outCustomer").value),
          q = +$("outQty").value;
        if (!i || !c || q <= 0) return;
        if (i.boxes < q)
          return toast("Stok kardus tidak cukup. Tersedia " + fmt(i.boxes));
        i.boxes -= q;
        tx(
          i,
          "Barang Keluar",
          $("outDate").value,
          "-" + fmt(q) + " kardus",
          [c.name, $("outDoc").value, $("outDriver").value, $("outNote").value]
            .filter(Boolean)
            .join(" | "),
        );
        save();
        e.target.reset();
        dates();
        toast("Pengiriman berhasil dicatat");
      };

      function exportCSV(kind) {
        let rows;
        if (kind === "barang")
          rows = [
            [
              "Kode SKU",
              "Nama Barang",
              "Ukuran",
              "Isi/Kardus",
              "Stok Pcs",
              "Stok Kardus",
              "Minimum Kardus",
              "Status",
            ],
            ...db.items.map((i) => [
              i.code,
              i.name,
              i.size,
              i.perBox,
              i.pcs,
              i.boxes,
              i.minBox,
              i.boxes < i.minBox ? "Menipis" : "Aman",
            ]),
          ];
        else
          rows = [
            ["Tanggal", "Jenis", "Kode", "Barang", "Perubahan", "Keterangan"],
            ...db.tx.map((t) => [
              t.date,
              t.type,
              t.code,
              t.itemName,
              t.change,
              t.note,
            ]),
          ];
        let csv =
            "\ufeff" +
            rows
              .map((r) =>
                r
                  .map((v) => '"' + String(v ?? "").replace(/"/g, '""') + '"')
                  .join(";"),
              )
              .join("\r\n"),
          url = URL.createObjectURL(
            new Blob([csv], { type: "text/csv;charset=utf-8" }),
          ),
          a = document.createElement("a");
        a.href = url;
        a.download =
          (kind === "barang" ? "laporan_stok" : "riwayat_transaksi") +
          "_" +
          today() +
          ".csv";
        a.click();
        URL.revokeObjectURL(url);
        toast("CSV siap dibuka di Excel");
      }

      $("exportNav").onclick = () =>
        modal(
          "Ekspor Laporan",
          `<p>CSV dapat dibuka dengan Microsoft Excel.</p><div class="quick"><button onclick="exportCSV('barang');closeModal()">📊 Ekspor Laporan Stok</button><button class="qgreen" onclick="exportCSV('transaksi');closeModal()">🧾 Ekspor Riwayat Transaksi</button></div>`,
        );

      $("backupNav").onclick = () => {
        let a = document.createElement("a"),
          url = URL.createObjectURL(
            new Blob([JSON.stringify(db, null, 2)], {
              type: "application/json",
            }),
          );
        a.href = url;
        a.download = "backup_aquafresh_" + today() + ".json";
        a.click();
        URL.revokeObjectURL(url);
        toast("Backup diunduh");
      };

      $("date").textContent = new Date().toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      dates();
      refresh();
      checkAuth();
      initNavigation();
      bindBatchGenerators();
      loadData();

