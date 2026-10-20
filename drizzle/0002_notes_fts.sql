-- Busca de texto completo nas anotações (FTS5, sem diferenciar acentos: "binaria" acha "binária").
-- Tabela de conteúdo externo: o texto fica só em `notes`; os gatilhos mantêm o índice em dia.
CREATE VIRTUAL TABLE `notes_fts` USING fts5(
	title,
	content_text,
	content='notes',
	content_rowid='id',
	tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `notes_fts_insert` AFTER INSERT ON `notes` BEGIN
	INSERT INTO notes_fts(rowid, title, content_text) VALUES (new.id, new.title, new.content_text);
END;
--> statement-breakpoint
CREATE TRIGGER `notes_fts_delete` AFTER DELETE ON `notes` BEGIN
	INSERT INTO notes_fts(notes_fts, rowid, title, content_text) VALUES ('delete', old.id, old.title, old.content_text);
END;
--> statement-breakpoint
CREATE TRIGGER `notes_fts_update` AFTER UPDATE OF title, content_text ON `notes` BEGIN
	INSERT INTO notes_fts(notes_fts, rowid, title, content_text) VALUES ('delete', old.id, old.title, old.content_text);
	INSERT INTO notes_fts(rowid, title, content_text) VALUES (new.id, new.title, new.content_text);
END;
