-- Busca por palavras nos trechos da busca inteligente (mesmo esquema de notes_fts): complementa
-- os vetores com termos exatos ("chmod", "TCP") e cobre os trechos que ainda não têm vetor.
CREATE VIRTUAL TABLE `rag_chunks_fts` USING fts5(
	title,
	text,
	content='rag_chunks',
	content_rowid='id',
	tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `rag_chunks_fts_insert` AFTER INSERT ON `rag_chunks` BEGIN
	INSERT INTO rag_chunks_fts(rowid, title, text) VALUES (new.id, new.title, new.text);
END;
--> statement-breakpoint
CREATE TRIGGER `rag_chunks_fts_delete` AFTER DELETE ON `rag_chunks` BEGIN
	INSERT INTO rag_chunks_fts(rag_chunks_fts, rowid, title, text) VALUES ('delete', old.id, old.title, old.text);
END;
--> statement-breakpoint
CREATE TRIGGER `rag_chunks_fts_update` AFTER UPDATE OF title, text ON `rag_chunks` BEGIN
	INSERT INTO rag_chunks_fts(rag_chunks_fts, rowid, title, text) VALUES ('delete', old.id, old.title, old.text);
	INSERT INTO rag_chunks_fts(rowid, title, text) VALUES (new.id, new.title, new.text);
END;
