// Each run uses a new in-memory SQLite database, so practice queries cannot alter later attempts.
const ExamSqlRunner = (() => {
  const engineUrl = "https://cdn.jsdelivr.net/npm/sql.js@1.17.0/dist/sql-wasm-inline.js";
  let enginePromise;

  function engine() {
    if (!enginePromise) {
      enginePromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = engineUrl;
        script.onload = () => window.initSqlJs().then(resolve, reject);
        script.onerror = () => reject(new Error("โหลด SQLite ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง"));
        document.head.append(script);
      }).catch(error => {
        enginePromise = null;
        throw error;
      });
    }
    return enginePromise;
  }

  const parents = `
    PRAGMA foreign_keys = ON;
    CREATE TABLE rooms (room_id TEXT PRIMARY KEY, name TEXT NOT NULL, capacity INTEGER NOT NULL);
    CREATE TABLE students (student_id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT);
    CREATE TABLE slots (slot_id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(room_id), start_at TEXT, seats_left INTEGER NOT NULL);
    INSERT INTO rooms VALUES ('R1','ห้องอัลฟา',4),('R2','ห้องเบตา',4);
    INSERT INTO students VALUES ('S1','มิน','min@example.test'),('S2','บีม','beam@example.test'),('S3','ฟ้า','fah@example.test'),('S4','ต้น','ton@example.test');
    INSERT INTO slots VALUES ('L1','R1','09:00',2),('L2','R2','10:00',3),('L3','R1','11:00',2),('L4','R2','12:00',0);
  `;
  const reservations = `
    CREATE TABLE reservations (
      res_id TEXT PRIMARY KEY,
      slot_id TEXT NOT NULL REFERENCES slots(slot_id),
      student_id TEXT NOT NULL REFERENCES students(student_id),
      status TEXT NOT NULL CHECK(status IN ('active','cancelled'))
    );
    INSERT INTO reservations VALUES
      ('V1','L1','S1','active'),('V2','L1','S2','active'),
      ('V3','L2','S2','cancelled'),('V4','L2','S3','active');
  `;

  const sampleData = questionId => "rooms: R1 ห้องอัลฟา, R2 ห้องเบตา\nstudents: S1 มิน, S2 บีม, S3 ฟ้า, S4 ต้น\nslots: L1→R1, L2→R2, L3→R1, L4→R2 (ที่นั่ง 0)" + (questionId === "table" ? "\nreservations: ยังไม่มีตาราง ให้สร้างด้วย SQL ของคุณ" : "\nreservations: V1 L1/S1 active, V2 L1/S2 active, V3 L2/S2 cancelled, V4 L2/S3 active");

  function testInsert(db, sql) {
    try {
      db.run(sql);
      return "รับข้อมูล";
    } catch (error) {
      return "ปฏิเสธ: " + error.message;
    }
  }

  async function run(questionId, sql) {
    const SQL = await engine();
    const db = new SQL.Database();
    try {
      db.run(parents);
      if (questionId !== "table") db.run(reservations);
      if (questionId === "table") {
        db.run(sql);
        const columns = db.exec("PRAGMA table_info(reservations)")[0];
        if (!columns || !columns.values.length) throw new Error("ยังไม่พบตาราง reservations หลังรันคำสั่ง");
        const fields = columns.values.map(row => [row[1], row[2], row[3] ? "ใช่" : "ไม่", row[5] ? "ใช่" : "ไม่"]);
        const tests = [
          ["INSERT ข้อมูลถูกต้อง", testInsert(db, "INSERT INTO reservations VALUES ('T1','L1','S1','active')")],
          ["INSERT res_id = NULL", testInsert(db, "INSERT INTO reservations VALUES (NULL,'L1','S1','active')")],
          ["INSERT status = 'waiting'", testInsert(db, "INSERT INTO reservations VALUES ('T2','L1','S1','waiting')")],
          ["INSERT slot_id = 'L9'", testInsert(db, "INSERT INTO reservations VALUES ('T3','L9','S1','active')")]
        ];
        return {kind:"table", tables:[
          {title:"คอลัมน์ที่สร้าง", columns:["คอลัมน์","ชนิด","NOT NULL","PRIMARY KEY"], values:fields},
          {title:"ลอง INSERT เพื่อดู Constraints", columns:["กรณีทดสอบ","ผลที่ SQLite ตอบ"], values:tests}
        ]};
      }
      if (questionId === "trigger") {
        db.run(sql);
        const found = db.exec("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='reservations'")[0];
        if (!found || !found.values.length) throw new Error("ยังไม่พบ Trigger บนตาราง reservations หลังรันคำสั่ง");
        const before = db.exec("SELECT seats_left FROM slots WHERE slot_id='L3'")[0].values[0][0];
        db.run("INSERT INTO reservations VALUES ('T1','L3','S4','active')");
        const after = db.exec("SELECT seats_left FROM slots WHERE slot_id='L3'")[0].values[0][0];
        db.run("INSERT INTO reservations VALUES ('T2','L3','S3','cancelled')");
        const afterCancelled = db.exec("SELECT seats_left FROM slots WHERE slot_id='L3'")[0].values[0][0];
        db.run("INSERT INTO reservations VALUES ('T3','L4','S4','active')");
        const zeroSeat = db.exec("SELECT seats_left FROM slots WHERE slot_id='L4'")[0].values[0][0];
        return {kind:"trigger", tables:[{title:"ผลทดสอบ Trigger",columns:["เหตุการณ์","seats_left"],values:[
          ["L3 ก่อน INSERT",before],["L3 หลัง INSERT active",after],
          ["L3 หลัง INSERT cancelled",afterCancelled],["L4 หลัง INSERT active (เดิม 0)",zeroSeat]
        ]}]};
      }
      const result = db.exec(sql);
      const last = result[result.length - 1];
      return {kind:"query",tables:last?[{title:"ผลลัพธ์ที่ SQLite คืนมา",columns:last.columns,values:last.values}]:[],empty:!last || !last.values.length};
    } finally {
      db.close();
    }
  }

  return {run, sampleData};
})();
