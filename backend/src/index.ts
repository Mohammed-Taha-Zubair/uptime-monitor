import "dotenv/config";
import express from "express";
import { pool } from "./db";

const app = express();
app.use(express.json());

app.get("/health", async (_req, res) => {
  const result = await pool.query("SELECT NOW() AS now");
  res.json({ status: "ok", dbTime: result.rows[0].now });
});

app.get("/monitors/:id/open-incident", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Monitor id must be a number" });
    return;
  }

  try {
    const result = await pool.query(
      "select * from incidents WHERE monitor_id = $1 AND ended_at IS NULL",
      [id],
    );
    res.status(200).json({ incidents: result.rows[0] ?? null });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`API running on port ${process.env.PORT}`);
});
