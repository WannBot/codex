from flask import Flask, request, render_template_string, Response, session
import requests, io, os, secrets, json

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)

# === Load API keys dari file ===
with open("apikey.txt", encoding="utf-8") as f:
    API_KEYS = [line.strip() for line in f if line.strip()]

# === Load daftar kurir dari file ===
with open("couriers.json", encoding="utf-8") as f:
    COURIERS = json.load(f)

# === Load target wilayah ===
with open("wilayah.txt", encoding="utf-8") as f:
    TARGET_WILAYAH = [line.strip().lower() for line in f if line.strip()]

# === Load ads ===
ADS_SCRIPTS = ""
if os.path.exists("ads.txt"):
    with open("ads.txt", encoding="utf-8") as f:
        ADS_SCRIPTS = f.read()

# === Fungsi request dengan rotasi API key ===
def request_with_keys(courier, awb):
    for key in API_KEYS:
        try:
            url = f"https://api.binderbyte.com/v1/track?api_key={key}&courier={courier}&awb={awb}"
            r = requests.get(url, timeout=10).json()
            if r.get("status") == 200:
                return r
        except Exception:
            continue
    return {"status": 400, "message": "Nomor Resi Salah/Eror"}

# === Fungsi proses resi ===
def process_resi(courier, resi_now, results, target_results):
    try:
        r = request_with_keys(courier, resi_now)
        if r.get("status") == 200:
            detail = r["data"]["detail"]
            origin = detail.get("origin", "-")
            destination = detail.get("destination", "-")
            shipper = detail.get("shipper", "-")
            receiver = detail.get("receiver", "-")
            status = r["data"]["summary"].get("status", "-")
            history = r["data"].get("history", [])
            cocok = any(w in destination.lower() for w in TARGET_WILAYAH)

            hasil = {
                "resi": resi_now,
                "origin": origin,
                "destination": destination,
                "shipper": shipper,
                "receiver": receiver,
                "status": status,
                "cocok": cocok,
                "history": history,
                "error": None
            }
            results.append(hasil)
            if cocok:
                target_results.append(hasil)
        else:
            results.append({
                "resi": resi_now,
                "origin": "-", "destination": "-", "shipper": "-", "receiver": "-",
                "status": "-", "cocok": False, "history": [],
                "error": r.get("message", "Resi tidak ditemukan")
            })
    except Exception as e:
        results.append({
            "resi": resi_now,
            "origin": "-", "destination": "-", "shipper": "-", "receiver": "-",
            "status": "-", "cocok": False, "history": [],
            "error": str(e)
        })

# === Fungsi export TXT ===
def build_txt(results):
    output = io.StringIO()
    for r in results:
        output.write(f"Resi: {r['resi']}\n")
        output.write(f"Origin: {r['origin']}\n")
        output.write(f"Destination: {r['destination']}\n")
        output.write(f"Pengirim: {r['shipper']}\n")
        output.write(f"Penerima: {r['receiver']}\n")
        output.write(f"Status: {r['status']}\n")
        output.write("Riwayat:\n")
        for h in r["history"]:
            output.write(f"  {h['date']} - {h['desc']}\n")
        output.write("="*50 + "\n\n")
    return output.getvalue()

# === Fungsi build tabel HTML ===
def build_table(results):
    html = ""
    for r in results:
        html += "<table>"
        html += f"<tr><th>No Resi</th><td>{r['resi']}</td></tr>"
        html += f"<tr><th>Dari</th><td>{r['origin']}</td></tr>"
        html += f"<tr><th>Tujuan</th><td>{r['destination']}</td></tr>"
        html += f"<tr><th>Pengirim</th><td>{r['shipper']}</td></tr>"
        html += f"<tr><th>Penerima</th><td>{r['receiver']}</td></tr>"
        if r["error"]:
            html += f"<tr><th>Status</th><td><span class='error'>❌ {r['error']}</span></td></tr>"
        elif r["cocok"]:
            html += f"<tr><th>Status</th><td><span class='match'>✅ Sesuai Target - {r['status']}</span></td></tr>"
        else:
            html += f"<tr><th>Status</th><td><span class='skip'>➡ Bukan Target - {r['status']}</span></td></tr>"
        html += "</table>"

        if r["history"]:
            html += "<table><tr><th>Tanggal</th><th>Keterangan</th></tr>"
            for h in r["history"]:
                html += f"<tr><td>{h['date']}</td><td>{h['desc']}</td></tr>"
            html += "</table>"
    return html

# === HTML Template utama ===
HTML_PAGE = """
<!DOCTYPE html>
<html>
<head>
  <title>Cek Resi</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 30px; background: #f5f7fa; }
    h2, h3 { color: #2c3e50; }
    form {
      background: #fff;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1);
      display: flex;
      align-items: flex-end;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }
    label { font-weight: bold; color: #34495e; display:block; margin-bottom:4px; }
    input, select {
      padding: 6px 10px;
      border-radius: 4px;
      border: 1px solid #ccc;
      font-size: 14px;
      min-width: 180px;
    }
    button {
      background: #3498db;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      transition: 0.2s;
    }
    button:hover { background: #2980b9; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      background: #fff;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 2px 6px rgba(0,0,0,0.05);
    }
    th {
      background: #3498db;
      color: white;
      text-align: left;
      padding: 10px;
      width: 200px;
    }
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #eee;
    }
    tr:last-child td { border-bottom: none; }
    .match { color: green; font-weight: bold; }
    .skip { color: gray; }
    .error { color: red; font-weight: bold; }
    .btn-link {
      display: inline-block;
      margin: 5px;
      padding: 8px 14px;
      border-radius: 4px;
      text-decoration: none;
      font-size: 14px;
    }
    .download { background: #27ae60; color: white; }
    .view { background: #e67e22; color: white; }
  </style>
</head>
<body>
  <!-- 🔥 Banner iklan di paling atas -->
  <div style="margin-bottom:20px; text-align:center;">
    {{ ads|safe }}
  </div>

  <h2>📦 Cek Resi Ekspedisi</h2>
  <form method="get">
    <div>
      <label>Nomor Resi:</label>
      <input type="text" name="awb" required value="{{ awb or '' }}">
    </div>
    <div>
      <label>Jumlah Generate:</label>
      <input type="number" name="jumlah" value="{{ jumlah or 1 }}" min="1" max="50">
    </div>
    <div>
      <label>Kurir:</label>
      <select name="courier" required>
        {% for c in couriers %}
          <option value="{{ c['code'] }}" {% if courier == c['code'] %}selected{% endif %}>
            {{ c['description'] }}
          </option>
        {% endfor %}
      </select>
    </div>
    <div>
      <button type="submit">🔍 Cek Resi</button>
    </div>
  </form>

  {% if results %}
    <h3>📊 Hasil Pelacakan</h3>
    {% if has_target %}
      <a href="/download" class="btn-link download">⬇ Download TXT</a>
      <a href="/view" target="_blank" class="btn-link view">👁 View Target</a>
    {% endif %}
    {{ table_html|safe }}
  {% endif %}
</body>
</html>
"""

# === Route utama ===
@app.route("/", methods=["GET"])
def index():
    awb = request.args.get("awb")
    jumlah = int(request.args.get("jumlah", 1))
    courier = request.args.get("courier", "sicepat")

    results = []
    target_results = []

    if awb:
        import random

        # Jika semua digit -> sertakan resi asli dulu
        if awb.isdigit():
            base = awb.strip()
            # tambahkan resi asli sebagai entri pertama
            process_resi(courier, base, results, target_results)

            # prefix = semua digit kecuali 3 digit terakhir
            prefix = base[:-3]
            suffix_len = len(base) - len(prefix)  # biasanya 3
            seen = {base}

            # buat sampai jumlah total (termasuk resi asli) tercapai
            while len(results) < int(jumlah):
                rand_num = random.randint(0, 10**suffix_len - 1)
                suffix = str(rand_num).zfill(suffix_len)
                resi_now = prefix + suffix
                if resi_now in seen:
                    continue
                seen.add(resi_now)
                process_resi(courier, resi_now, results, target_results)

        else:
            # non-digit AWB
            resi_now = awb.strip()
            process_resi(courier, resi_now, results, target_results)

    session["target_results"] = target_results

    return render_template_string(
        HTML_PAGE,
        results=results,
        awb=awb,
        jumlah=jumlah,
        courier=courier,
        couriers=COURIERS,
        has_target=len(target_results) > 0,
        ads=ADS_SCRIPTS,
        table_html=build_table(results)
    )

@app.route("/download")
def download_txt():
    results = session.get("target_results", [])
    if not results:
        return "❌ Tidak ada hasil sesuai target wilayah."
    txt_data = build_txt(results)
    return Response(txt_data, mimetype="text/plain",
                    headers={"Content-Disposition": "attachment;filename=hasil.txt"})

@app.route("/view")
def view_txt():
    results = session.get("target_results", [])
    if not results:
        return "<p style='color:red;'>⚠️Refresh Website Untuk Melihat Hasil Target</p>"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>View Target</title>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 30px; background: #f7f9fc; }}
            h2 {{ color: #2c3e50; }}
            table {{ width: 100%; border-collapse: collapse; margin-bottom: 20px; }}
            th, td {{ padding: 10px; border: 1px solid #ccc; text-align: left; }}
            th {{ background: #2980b9; color: white; width: 25%; }}
            .match {{ color: green; font-weight: bold; }}
            .error {{ color: red; font-weight: bold; }}
        </style>
    </head>
    <body>
        <div style="text-align:center; margin-bottom:20px;">
            {ADS_SCRIPTS}
        </div>
        <h2>📊 Hasil Target Sesuai Wilayah</h2>
    """
    for r in results:
        html += f"""
        <table>
            <tr><th>No Resi</th><td>{r['resi']}</td></tr>
            <tr><th>Dari</th><td>{r['origin']}</td></tr>
            <tr><th>Tujuan</th><td>{r['destination']}</td></tr>
            <tr><th>Pengirim</th><td>{r['shipper']}</td></tr>
            <tr><th>Penerima</th><td>{r['receiver']}</td></tr>
            <tr><th>Status</th>
                <td><span class="match">✅  {r['status']}</span></td>
            </tr>
        </table>
        """
        if r['history']:
            html += """
            <table>
                <tr><th colspan="2">Riwayat Tracking</th></tr>
            """
            for h in r['history']:
                html += f"<tr><td>{h['date']}</td><td>{h['desc']}</td></tr>"
            html += "</table>"
    html += "</body></html>"
    return html
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
