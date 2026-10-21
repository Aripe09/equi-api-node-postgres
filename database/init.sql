-- Docker ejecuta este archivo solo cuando el directorio de datos esta vacio.
-- Un fallo revierte toda la inicializacion del esquema y las semillas.
BEGIN;

CREATE TABLE caballos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL CHECK (length(btrim(nombre)) > 0),
    raza VARCHAR(100) NOT NULL CHECK (length(btrim(raza)) > 0),
    edad INTEGER NOT NULL CHECK (edad BETWEEN 0 AND 60),
    sexo VARCHAR(20) NOT NULL CHECK (sexo IN ('Macho', 'Hembra')),
    color VARCHAR(100) CHECK (color IS NULL OR length(btrim(color)) > 0),
    disciplina VARCHAR(100) CHECK (disciplina IS NULL OR length(btrim(disciplina)) > 0),
    propietario VARCHAR(150) CHECK (propietario IS NULL OR length(btrim(propietario)) > 0),
    estado VARCHAR(30) NOT NULL DEFAULT 'Activo'
        CHECK (estado IN ('Activo', 'Inactivo', 'En tratamiento', 'Retirado')),
    fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_caballos_raza ON caballos (lower(raza));
CREATE INDEX idx_caballos_estado ON caballos (lower(estado));

INSERT INTO caballos (nombre, raza, edad, sexo, color, disciplina, propietario, estado) VALUES
('Trueno', 'Cuarto de Milla', 7, 'Macho', 'Bayo', 'Charrería', 'Rancho Los Encinos', 'Activo'),
('Sombra', 'Frisón', 6, 'Hembra', 'Negro', 'Doma clásica', 'Hacienda La Luna', 'Activo'),
('Zafiro', 'Árabe', 8, 'Macho', 'Tordo', 'Resistencia', 'Rancho El Oasis', 'Activo'),
('Estrella', 'Azteca', 4, 'Hembra', 'Alazán', 'Charrería', 'Rancho Las Flores', 'Activo'),
('Duque', 'Andaluz', 9, 'Macho', 'Tordo', 'Alta escuela', 'Hacienda del Sol', 'Retirado'),
('Relámpago', 'Appaloosa', 5, 'Macho', 'Moteado', 'Equitación western', 'Rancho El Encanto', 'Activo'),
('Aurora', 'Pura Sangre Inglés', 3, 'Hembra', 'Castaño', 'Carreras', 'Cuadra La Esperanza', 'En tratamiento'),
('Apache', 'Paint Horse', 6, 'Macho', 'Pinto', 'Reining', 'Rancho El Mezquite', 'Activo'),
('Brisa', 'Lusitano', 10, 'Hembra', 'Palomino', 'Doma clásica', 'Hacienda Los Olivos', 'Inactivo'),
('Titán', 'Percherón', 8, 'Macho', 'Negro', 'Tiro', 'Granja El Roble', 'Activo');

COMMIT;
