require('dotenv').config();
const express=require('express');
const path=require('path');
const cookieParser=require('cookie-parser');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const Database=require('better-sqlite3');
const crypto=require('crypto');
const Razorpay=require('razorpay');

const app=express();
const PORT=process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET||'dev-secret-change-me';
const db=new Database(path.join(__dirname,'playbook.db'));
db.pragma('journal_mode = WAL');
app.use(express.json({limit:'2mb'})); app.use(cookieParser()); app.use(express.static(path.join(__dirname,'public')));

db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,phone TEXT,role TEXT NOT NULL DEFAULT 'user',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS venues(id INTEGER PRIMARY KEY AUTOINCREMENT,owner_id INTEGER,name TEXT NOT NULL,type TEXT NOT NULL,city TEXT NOT NULL,area TEXT,description TEXT,price INTEGER NOT NULL,image TEXT,rating REAL DEFAULT 0,verified INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(owner_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS slots(id INTEGER PRIMARY KEY AUTOINCREMENT,venue_id INTEGER NOT NULL,date TEXT NOT NULL,time TEXT NOT NULL,price INTEGER NOT NULL,available INTEGER DEFAULT 1,UNIQUE(venue_id,date,time),FOREIGN KEY(venue_id) REFERENCES venues(id));
CREATE TABLE IF NOT EXISTS bookings(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,venue_id INTEGER NOT NULL,slot_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',amount INTEGER NOT NULL,payment_id TEXT,order_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(slot_id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(venue_id) REFERENCES venues(id),FOREIGN KEY(slot_id) REFERENCES slots(id));`);

function sign(user){return jwt.sign({id:user.id,name:user.name,email:user.email,role:user.role},JWT_SECRET,{expiresIn:'7d'});}
function auth(req,res,next){const token=req.cookies.pb_token; if(!token)return res.status(401).json({error:'Login required'}); try{req.user=jwt.verify(token,JWT_SECRET);next()}catch(e){res.status(401).json({error:'Session expired'})}}
function optionalAuth(req,res,next){const token=req.cookies.pb_token;if(token){try{req.user=jwt.verify(token,JWT_SECRET)}catch{}}next()}
function normalize(s){return String(s||'').trim().toLowerCase()}

const imageMap={
'Box Cricket':'/assets/venue-box-cricket.png','Badminton':'/assets/venue-badminton.png','Football':'/assets/venue-football.png','Swimming':'/assets/venue-swimming.png','Pickleball':'/assets/venue-pickleball.png','Game Zone':'/assets/venue-gamezone.png'
};
function seed(){
 const count=db.prepare('SELECT COUNT(*) c FROM venues').get().c; if(count) return;
 const adminEmail=process.env.ADMIN_EMAIL||'admin@playbook.local'; const adminPass=process.env.ADMIN_PASSWORD||'ChangeMe123!';
 let admin=db.prepare('SELECT * FROM users WHERE email=?').get(adminEmail); if(!admin){const h=bcrypt.hashSync(adminPass,10); const r=db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run('PlayBook Admin',adminEmail,h,'admin');admin=db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid)}
 const ownerHash=bcrypt.hashSync('Owner123!',10); const own=db.prepare('INSERT OR IGNORE INTO users(name,email,password,role) VALUES(?,?,?,?)').run('Demo Venue Owner','owner@playbook.local',ownerHash,'owner'); const owner=db.prepare('SELECT id FROM users WHERE email=?').get('owner@playbook.local');
 const venues=[['Smash Arena Box Cricket','Box Cricket','Hyderabad','Gachibowli',800,'Popular'],['Ace Badminton Club','Badminton','Hyderabad','Madhapur',550,'Top rated'],['Urban Football Arena','Football','Hyderabad','Kondapur',1200,'Trending'],['BlueWave Swimming Club','Swimming','Hyderabad','Jubilee Hills',450,'Popular'],['PicklePro Courts','Pickleball','Hyderabad','HITEC City',700,'New'],['The Game District','Game Zone','Hyderabad','Banjara Hills',399,'Family']];
 const ins=db.prepare('INSERT INTO venues(owner_id,name,type,city,area,description,price,image,rating,verified) VALUES(?,?,?,?,?,?,?,?,?,?)');
 for(const v of venues){const r=ins.run(owner.id,v[0],v[1],v[2],v[3],`Book ${v[1]} sessions at ${v[0]}.`,v[4],imageMap[v[1]],4.5+Math.random()*.4,1); const vid=r.lastInsertRowid; for(let d=0;d<14;d++){const dt=new Date(Date.now()+d*86400000).toISOString().slice(0,10); for(const time of ['06:00','07:00','08:00','09:00','17:00','18:00','19:00','20:00','21:00']) db.prepare('INSERT OR IGNORE INTO slots(venue_id,date,time,price) VALUES(?,?,?,?)').run(vid,dt,time,v[4]);}}
}
seed();

app.post('/api/auth/signup',async(req,res)=>{try{const {name,email,password,phone}=req.body;if(!name||!email||!password||password.length<6)return res.status(400).json({error:'Name, email and a 6+ character password are required'});const exists=db.prepare('SELECT id FROM users WHERE email=?').get(normalize(email));if(exists)return res.status(409).json({error:'Email already registered'});const hash=await bcrypt.hash(password,10);const r=db.prepare('INSERT INTO users(name,email,password,phone) VALUES(?,?,?,?)').run(name.trim(),normalize(email),hash,phone||'');const u=db.prepare('SELECT id,name,email,phone,role FROM users WHERE id=?').get(r.lastInsertRowid);res.cookie('pb_token',sign(u),{httpOnly:true,sameSite:'lax',secure:false,maxAge:7*86400000});res.json({user:u})}catch(e){res.status(500).json({error:'Could not create account'})}});
app.post('/api/auth/login',async(req,res)=>{const {email,password}=req.body;const u=db.prepare('SELECT * FROM users WHERE email=?').get(normalize(email));if(!u||!(await bcrypt.compare(password||'',u.password)))return res.status(401).json({error:'Invalid email or password'});const safe={id:u.id,name:u.name,email:u.email,phone:u.phone,role:u.role};res.cookie('pb_token',sign(safe),{httpOnly:true,sameSite:'lax',secure:false,maxAge:7*86400000});res.json({user:safe})});
app.post('/api/auth/logout',(req,res)=>{res.clearCookie('pb_token');res.json({ok:true})});
app.get('/api/auth/me',optionalAuth,(req,res)=>res.json({user:req.user||null}));

app.get('/api/venues',(req,res)=>{const {location,type}=req.query;let sql='SELECT * FROM venues WHERE 1=1',p=[];if(location){sql+=' AND (city LIKE ? OR area LIKE ?)';p.push('%'+location+'%','%'+location+'%')}if(type&&type!=='All activities'){sql+=' AND type=?';p.push(type)}sql+=' ORDER BY verified DESC,rating DESC';res.json({venues:db.prepare(sql).all(...p)})});
app.get('/api/venues/:id',(req,res)=>{const v=db.prepare('SELECT * FROM venues WHERE id=?').get(req.params.id);if(!v)return res.status(404).json({error:'Venue not found'});res.json({venue:v})});
app.get('/api/venues/:id/slots',(req,res)=>{const date=req.query.date||new Date().toISOString().slice(0,10);const rows=db.prepare(`SELECT s.* FROM slots s LEFT JOIN bookings b ON b.slot_id=s.id AND b.status IN ('pending','paid') WHERE s.venue_id=? AND s.date=? AND b.id IS NULL ORDER BY s.time`).all(req.params.id,date);res.json({date,slots:rows})});

app.post('/api/venues',auth,(req,res)=>{if(!['owner','admin'].includes(req.user.role))return res.status(403).json({error:'Owner account required'});const {name,type,city,area,description,price,image}=req.body;if(!name||!type||!city||!price)return res.status(400).json({error:'Name, activity, city and price are required'});const img=image||imageMap[type]||'/assets/reference-venues.png';const r=db.prepare('INSERT INTO venues(owner_id,name,type,city,area,description,price,image,verified) VALUES(?,?,?,?,?,?,?,?,0)').run(req.user.id,name,type,city,area||'',description||'',Number(price),img);res.json({venue:db.prepare('SELECT * FROM venues WHERE id=?').get(r.lastInsertRowid)})});
app.get('/api/owner/venues',auth,(req,res)=>{if(!['owner','admin'].includes(req.user.role))return res.status(403).json({error:'Owner account required'});const vs=req.user.role==='admin'?db.prepare('SELECT * FROM venues ORDER BY id DESC').all():db.prepare('SELECT * FROM venues WHERE owner_id=? ORDER BY id DESC').all(req.user.id);res.json({venues:vs})});

function razor(){if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET)return null;return new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET})}
app.post('/api/bookings/order',auth,async(req,res)=>{try{const {venueId,slotId}=req.body;const slot=db.prepare(`SELECT s.*,v.name venue_name FROM slots s JOIN venues v ON v.id=s.venue_id WHERE s.id=? AND s.venue_id=?`).get(slotId,venueId);if(!slot)return res.status(404).json({error:'Slot not found'});const busy=db.prepare("SELECT id FROM bookings WHERE slot_id=? AND status IN ('pending','paid')").get(slotId);if(busy)return res.status(409).json({error:'That slot has just been booked'});const rzp=razor();let orderId='demo_'+crypto.randomUUID();if(rzp){const order=await rzp.orders.create({amount:slot.price*100,currency:'INR',receipt:'pb_'+Date.now()});orderId=order.id}const b=db.prepare("INSERT INTO bookings(user_id,venue_id,slot_id,status,amount,order_id) VALUES(?,?,?,?,?,?)").run(req.user.id,venueId,slotId,'pending',slot.price,orderId);res.json({bookingId:b.lastInsertRowid,orderId,amount:slot.price,keyId:process.env.RAZORPAY_KEY_ID||null,demo:!rzp,venueName:slot.venue_name})}catch(e){console.error(e);res.status(500).json({error:'Could not create payment order'})}});
app.post('/api/bookings/verify',auth,(req,res)=>{try{const {bookingId,razorpay_order_id,razorpay_payment_id,razorpay_signature}=req.body;const b=db.prepare('SELECT * FROM bookings WHERE id=? AND user_id=?').get(bookingId,req.user.id);if(!b)return res.status(404).json({error:'Booking not found'});if(process.env.RAZORPAY_KEY_SECRET){const expected=crypto.createHmac('sha256',process.env.RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');if(expected!==razorpay_signature)return res.status(400).json({error:'Payment signature verification failed'})}db.prepare("UPDATE bookings SET status='paid',payment_id=? WHERE id=?").run(razorpay_payment_id||'demo_payment',bookingId);res.json({ok:true})}catch(e){res.status(500).json({error:'Payment verification failed'})}});
app.post('/api/bookings/demo-confirm',auth,(req,res)=>{const {bookingId}=req.body;const b=db.prepare('SELECT * FROM bookings WHERE id=? AND user_id=?').get(bookingId,req.user.id);if(!b)return res.status(404).json({error:'Booking not found'});db.prepare("UPDATE bookings SET status='paid',payment_id='demo_payment' WHERE id=?").run(bookingId);res.json({ok:true})});
app.get('/api/bookings',auth,(req,res)=>{const rows=db.prepare(`SELECT b.*,v.name venue_name,v.city,v.area,s.date,s.time FROM bookings b JOIN venues v ON v.id=b.venue_id JOIN slots s ON s.id=b.slot_id WHERE b.user_id=? ORDER BY b.id DESC`).all(req.user.id);res.json({bookings:rows})});

app.get('/api/admin/stats',auth,(req,res)=>{if(req.user.role!=='admin')return res.status(403).json({error:'Admin only'});res.json({users:db.prepare('SELECT COUNT(*) c FROM users').get().c,venues:db.prepare('SELECT COUNT(*) c FROM venues').get().c,bookings:db.prepare("SELECT COUNT(*) c FROM bookings WHERE status='paid'").get().c,revenue:db.prepare("SELECT COALESCE(SUM(amount),0) c FROM bookings WHERE status='paid'").get().c})});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`PlayBook India running on http://localhost:${PORT}`));
