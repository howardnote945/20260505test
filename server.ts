import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL?.replace(/\/$/, '')}/auth/google/callback`
  );

  const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'];

  // --- API Routes ---

  app.get("/api/auth/google/url", (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
    res.json({ url });
  });

  app.get("/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      
      // Store token in cookie
      res.cookie('google_token', JSON.stringify(tokens), {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>驗證成功！視窗即將關閉...</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('OAuth Error:', error);
      res.status(500).send('Authentication failed');
    }
  });

  app.get("/api/auth/status", (req, res) => {
    const token = req.cookies.google_token;
    res.json({ isAuthenticated: !!token });
  });

  app.post("/api/export/sheets", async (req, res) => {
    const tokenCookie = req.cookies.google_token;
    if (!tokenCookie) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const tokens = JSON.parse(tokenCookie);
      oauth2Client.setCredentials(tokens);

      const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
      const { groups, title } = req.body;

      // 1. Create a new Spreadsheet
      const spreadsheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: title || `分組結果_${new Date().toLocaleDateString()}`,
          },
        },
      });

      const spreadsheetId = spreadsheet.data.spreadsheetId;

      // 2. Prepare data
      const values = [['組別', '成員']];
      groups.forEach((group: string[], i: number) => {
        group.forEach(member => {
          values.push([`第 ${i + 1} 組`, member]);
        });
      });

      // 3. Write data
      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId!,
        range: 'A1',
        valueInputOption: 'RAW',
        requestBody: {
          values,
        },
      });

      res.json({ 
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
        spreadsheetId 
      });
    } catch (error) {
      console.error('Sheets Export Error:', error);
      res.status(500).json({ error: 'Export failed' });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie('google_token');
    res.json({ success: true });
  });

  // --- Vite / Static Handling ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
