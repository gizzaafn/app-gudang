export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const json = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    };

    try {
      // ROUTES: /items
      if (path === "/items" || path.startsWith("/items/")) {
        // GET /items
        if (method === "GET") {
          const { results } = await env.DB.prepare(
            "SELECT * FROM items ORDER BY id ASC"
          ).all();
          return json(results);
        }

        // POST or PUT /items (Insert or Update if id or code exists)
        if (method === "POST" || method === "PUT") {
          const body = await request.json();
          const { id, code, name, size, perBox, minBox, pcs, boxes } = body;

          let existing = null;
          if (id) {
            existing = await env.DB.prepare(
              "SELECT * FROM items WHERE id = ?"
            ).bind(id).first();
          }
          if (!existing && code) {
            existing = await env.DB.prepare(
              "SELECT * FROM items WHERE UPPER(TRIM(code)) = UPPER(TRIM(?))"
            ).bind(code).first();
          }

          if (existing) {
            const targetId = existing.id;
            await env.DB.prepare(
              `UPDATE items SET 
                code = ?, 
                name = ?, 
                size = ?, 
                perBox = ?, 
                minBox = ?, 
                pcs = ?, 
                boxes = ? 
              WHERE id = ?`
            ).bind(
              code || existing.code,
              name || existing.name,
              size !== undefined ? size : existing.size,
              perBox !== undefined ? perBox : existing.perBox,
              minBox !== undefined ? minBox : existing.minBox,
              pcs !== undefined ? pcs : existing.pcs,
              boxes !== undefined ? boxes : existing.boxes,
              targetId
            ).run();

            return json({ success: true, updated: true, id: targetId });
          } else {
            const res = await env.DB.prepare(
              `INSERT INTO items (code, name, size, perBox, minBox, pcs, boxes) VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              code,
              name,
              size || "",
              perBox || 24,
              minBox !== undefined ? minBox : 0,
              pcs || 0,
              boxes || 0
            ).run();

            return json({ success: true, inserted: true, id: res.meta.last_row_id });
          }
        }

        // DELETE /items or /items/:id
        if (method === "DELETE") {
          let id = url.searchParams.get("id");
          if (!id) {
            const parts = path.split("/").filter(Boolean);
            if (parts.length > 1) id = parts[1];
          }
          if (id) {
            await env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
            return json({ success: true, deleted: id });
          }
          return json({ error: "Missing id" }, 400);
        }
      }

      // ROUTES: /customers
      if (path === "/customers" || path.startsWith("/customers/")) {
        // GET /customers
        if (method === "GET") {
          const { results } = await env.DB.prepare(
            "SELECT * FROM customers ORDER BY id ASC"
          ).all();
          return json(results);
        }

        // POST or PUT /customers (Insert or Update if id or code exists)
        if (method === "POST" || method === "PUT") {
          const body = await request.json();
          const { id, code, name, contact, address } = body;

          let existing = null;
          if (id) {
            existing = await env.DB.prepare(
              "SELECT * FROM customers WHERE id = ?"
            ).bind(id).first();
          }
          if (!existing && code) {
            existing = await env.DB.prepare(
              "SELECT * FROM customers WHERE UPPER(TRIM(code)) = UPPER(TRIM(?))"
            ).bind(code).first();
          }

          if (existing) {
            const targetId = existing.id;
            await env.DB.prepare(
              "UPDATE customers SET code = ?, name = ?, contact = ?, address = ? WHERE id = ?"
            ).bind(
              code || existing.code,
              name || existing.name,
              contact !== undefined ? contact : existing.contact,
              address !== undefined ? address : existing.address,
              targetId
            ).run();

            return json({ success: true, updated: true, id: targetId });
          } else {
            const res = await env.DB.prepare(
              "INSERT INTO customers (code, name, contact, address) VALUES (?, ?, ?, ?)"
            ).bind(code, name, contact || "", address || "").run();

            return json({ success: true, inserted: true, id: res.meta.last_row_id });
          }
        }

        // DELETE /customers or /customers/:id
        if (method === "DELETE") {
          let id = url.searchParams.get("id");
          if (!id) {
            const parts = path.split("/").filter(Boolean);
            if (parts.length > 1) id = parts[1];
          }
          if (id) {
            await env.DB.prepare("DELETE FROM customers WHERE id = ?").bind(id).run();
            return json({ success: true, deleted: id });
          }
          return json({ error: "Missing id" }, 400);
        }
      }

      // ROUTES: /transactions
      if (path === "/transactions" || path.startsWith("/transactions/")) {
        if (method === "GET") {
          const { results } = await env.DB.prepare(
            "SELECT * FROM transactions ORDER BY id DESC LIMIT 500"
          ).all();
          return json(results);
        }

        if (method === "POST") {
          const body = await request.json();
          const { date, type, code, itemName, item_name, change, qty_change, note } = body;
          const res = await env.DB.prepare(
            "INSERT INTO transactions (date, type, code, item_name, qty_change, note) VALUES (?, ?, ?, ?, ?, ?)"
          ).bind(
            date,
            type,
            code,
            itemName || item_name || "",
            change || qty_change || "",
            note || ""
          ).run();

          return json({ success: true, id: res.meta.last_row_id });
        }
      }

      return json({ error: "Not Found", path }, 404);
    } catch (e) {
      return json({ error: e.message || String(e) }, 500);
    }
  }
};
