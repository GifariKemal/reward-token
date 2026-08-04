-- Dibuat oleh `bun run seed:export`. Jangan disunting tangan.
-- Snapshot indeks riwayat on-chain yang block-nya sudah/akan dipangkas RPC publik.

-- bounties: 3 baris
INSERT OR IGNORE INTO bounties (bounty_id, escrow, creator, reward_amount, tx_hash, block_number, block_hash, created_at) VALUES (0, '0xe8f7dD0Fce998CB3f58b033D205FaB84c25aA074', '0x920bEF978Cffda8a030D4Aa3C9D3aa5ecAA3C1A0', '100000000000000000000', '0x3b8823015a3a91735452b6d674f00a05136fbaec018206f023e29fbfd0e52ce6', 121410792, '0x0f989481ea8ca37720a8fedacdfc2068069e7c014d37a8c1359d00314d21bfb7', 1785769763);
INSERT OR IGNORE INTO bounties (bounty_id, escrow, creator, reward_amount, tx_hash, block_number, block_hash, created_at) VALUES (1, '0x8646d92e18a54729BaaF9f6E74B9B890817EF717', '0x920bEF978Cffda8a030D4Aa3C9D3aa5ecAA3C1A0', '10000000000000000000', '0xd4ef3df220ce92211179f41e7541dbec61f93eef59819c902993b23721c84cff', 123071440, '0xbf4edf46e63ea150607b324bd86b9006b0f1d4c95fa0df5f8a822cb0bfbb5091', 1785828443);
INSERT OR IGNORE INTO bounties (bounty_id, escrow, creator, reward_amount, tx_hash, block_number, block_hash, created_at) VALUES (2, '0x0497372C7708cE81Fd0358adeD40F84b293E8031', '0x920bEF978Cffda8a030D4Aa3C9D3aa5ecAA3C1A0', '5000000000000000000', '0xfa96053a6f9e562d8bfd1d407a36c78b3517c1e3bc767e68d3709031c710171e', 123072016, '0xfe81f00b6770a67c7bd72b6a75d73fc2962a2200dd62e6918566033c0015f519', 1785828702);

-- submissions: 3 baris
INSERT OR IGNORE INTO submissions (escrow, worker, proof_uri, status, reward_amount, tx_hash, block_number, block_hash, created_at) VALUES ('0xe8f7dd0fce998cb3f58b033d205fab84c25aa074', '0x920bEF978Cffda8a030D4Aa3C9D3aa5ecAA3C1A0', 'https://github.com/GifariKemal/wattsettle/blob/main/BUKTI.md', 'rewarded', '100000000000000000000', '0x150c62133224e047e46c0e3fccaba43d542f759903cf99fa59db85a0386a50a5', 121410864, '0xc434013debc1bee9801bbdbc87986fdd1014c8acdd79a68c213cd6f279122cf0', 1785769765);
INSERT OR IGNORE INTO submissions (escrow, worker, proof_uri, status, reward_amount, tx_hash, block_number, block_hash, created_at) VALUES ('0x8646d92e18a54729baaf9f6e74b9b890817ef717', '0x920bEF978Cffda8a030D4Aa3C9D3aa5ecAA3C1A0', 'https://github.com/GifariKemal/wattsettle/blob/main/BUKTI-uji-realtime.md', 'rewarded', '10000000000000000000', '0xda732d098fdf18a533fbe8f204db3d76b9446ddb849c1aac6f379086cb5c71c4', 123071656, '0x4a8cdc25d3b94a934763dab5ebdb4307cd3461283cfc687a8db1bd8541ee9726', 1785828539);
INSERT OR IGNORE INTO submissions (escrow, worker, proof_uri, status, reward_amount, tx_hash, block_number, block_hash, created_at) VALUES ('0x0497372c7708ce81fd0358aded40f84b293e8031', '0x920bEF978Cffda8a030D4Aa3C9D3aa5ecAA3C1A0', 'https://github.com/GifariKemal/wattsettle/blob/main/BUKTI-uji-reject.md', 'rejected', NULL, '0x26a08d4b3c9451e626539b9ab98f74dc266bdb5098f2439f185637384b092159', 123072088, '0x092186038d1d5b2991bb7edace7a7a093c3b1a47c55f94ebc12a45281f1759ec', 1785828735);

-- checkpoint: klon baru melanjutkan dari sini, tidak memindai riwayat yang sudah dipangkas
INSERT INTO sync_checkpoint (id, last_block) VALUES (1, 123078977)
  ON CONFLICT(id) DO UPDATE SET last_block = MAX(last_block, 123078977);
