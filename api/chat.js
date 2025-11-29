import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient } from '@googlemaps/google-maps-services-js';
// import * as fs from 'fs/promises'; // Eliminamos la dependencia de fs
// import path from 'path'; // Eliminamos la dependencia de path

// Usamos el modelo más rápido y económico para chat
const MODEL_NAME = "gemini-2.5-flash"; 
const MAX_CHAT_RESULTS = 4; // Límite de resultados a mostrar en el texto plano

// =========================================================================
// ⚠️ CAMBIO CLAVE: TU LISTA DE LUGARES AHORA ES LA FUENTE DE DATOS PRINCIPAL
// La he incrustado directamente en el código para asegurar que Gemini NO invente.
// =========================================================================
const PROGRESO_DATA = [
    {
        "Title": "JM Dental Clinic",
        "Section": "clinicas_dentales",
        "Address": "Dirección no disponible",
        "Description": "Clínica dental en la frontera, conocida por sus servicios generales.",
        "placeCategory": "Clínica Dental",
        "isHealthPlace": true
    },
    {
        "Title": "JC Dental Clinic",
        "Section": "clinicas_dentales",
        "Address": "Dirección no disponible",
        "Description": "Centro odontológico completo con especialidades.",
        "placeCategory": "Centro Odontológico",
        "isHealthPlace": true
    },
    {
        "Title": "Mustre Dental Clinic",
        "Section": "clinicas_dentales",
        "Address": "Dirección no disponible",
        "Description": "Clínica dental que ofrece servicios de alta calidad.",
        "placeCategory": "Clínica Dental",
        "isHealthPlace": true
    },
    {
        "Title": "Dental Artistry Dental Center",
        "Section": "clinicas_dentales",
        "Address": "Dirección no disponible",
        "Description": "Centro especializado en arte y estética dental.",
        "placeCategory": "Centro Dental Estético",
        "isHealthPlace": true
    },
    {
        "Title": "Alpha Dental Implant Center",
        "Section": "clinicas_dentales",
        "Address": "Dirección no disponible",
        "Description": "Especialistas en implantes dentales.",
        "placeCategory": "Centro de Implantes",
        "isHealthPlace": true
    },
    {
        "Title": "Salazar Dental Center",
        "Section": "clinicas_dentales",
        "Address": "Dirección no disponible",
        "Description": "Clínica familiar que ofrece una amplia gama de tratamientos.",
        "placeCategory": "Clínica Dental Familiar",
        "isHealthPlace": true
    },
    {
        "Title": "Guadalcazar Dental Clinic",
        "Section": "clinicas_dentales",
        "Address": "Dirección no disponible",
        "Description": "Clínica dental general con experiencia.",
        "placeCategory": "Clínica Dental General",
        "isHealthPlace": true
    },
    {
        "Title": "Progreso Smile Dental Center",
        "Section": "clinicas_dentales",
        "Address": "Dirección no disponible",
        "Description": "Dedicados a mejorar la sonrisa de sus pacientes.",
        "placeCategory": "Centro Dental de Sonrisas",
        "isHealthPlace": true
    },
    {
        "Title": "Dr. Dominga Cortez (clinica)",
        "Section": "clinicas_dentales",
        "Address": "Dirección no disponible",
        "Description": "Consultorio y clínica de la Dra. Cortez.",
        "placeCategory": "Consultorio Dental",
        "isHealthPlace": true
    },
    {
        "Title": "Dr. Sandra Bucardo (consultorio)",
        "Section": "clinicas_dentales",
        "Address": "Dirección no disponible",
        "Description": "Consultorio privado de la Dra. Bucardo.",
        "placeCategory": "Consultorio Dental",
        "isHealthPlace": true
    },
    {
        "Title": "Magic Dental Clinic",
        "Section": "clinicas_dentales",
        "Address": "Dirección no disponible",
        "Description": "Clínica con un enfoque moderno en odontología.",
        "placeCategory": "Clínica Dental",
        "isHealthPlace": true
    },
    {
        "Title": "Dental DR. Dr. Ivan Diaz",
        "Section": "clinicas_dentales",
        "Address": "Dirección no disponible",
        "Description": "Consultorio del Dr. Iván Díaz, servicios dentales.",
        "placeCategory": "Consultorio Dental",
        "isHealthPlace": true
    },
    {
        "Title": "Taquería Doña Ale",
        "Section": "taquerias_tacos_y_lonches",
        "Address": "Dirección no disponible",
        "Description": "Tacos y lonches tradicionales.",
        "placeCategory": "Taquería",
        "isHealthPlace": false
    },
    {
        "Title": "Taquería Víctor",
        "Section": "taquerias_tacos_y_lonches",
        "Address": "Dirección no disponible",
        "Description": "Taquería con amplia variedad de guisos.",
        "placeCategory": "Taquería",
        "isHealthPlace": false
    },
    {
        "Title": "Taquería El No Que No",
        "Section": "taquerias_tacos_y_lonches",
        "Address": "Dirección no disponible",
        "Description": "Conocida por su sabor único en tacos.",
        "placeCategory": "Taquería",
        "isHealthPlace": false
    },
    {
        "Title": "Iguana House Taqueria (Pavita)",
        "Section": "taquerias_tacos_y_lonches",
        "Address": "Dirección no disponible",
        "Description": "Taquería especializada en el surtido.",
        "placeCategory": "Taquería",
        "isHealthPlace": false
    },
    {
        "Title": "Taquería Don Benny",
        "Section": "taquerias_tacos_y_lonches",
        "Address": "Dirección no disponible",
        "Description": "Tacos y especialidades de la casa.",
        "placeCategory": "Taquería",
        "isHealthPlace": false
    },
    {
        "Title": "Taquería Serratos",
        "Section": "taquerias_tacos_y_lonches",
        "Address": "Dirección no disponible",
        "Description": "Un lugar clásico de tacos en Nuevo Progreso.",
        "placeCategory": "Taquería",
        "isHealthPlace": false
    },
    {
        "Title": "Taquería Los Agachados",
        "Section": "taquerias_tacos_y_lonches",
        "Address": "Dirección no disponible",
        "Description": "Taquería con mesas o servicio rápido.",
        "placeCategory": "Taquería",
        "isHealthPlace": false
    },
    {
        "Title": "Taquería Don Chuy",
        "Section": "taquerias_tacos_y_lonches",
        "Address": "Dirección no disponible",
        "Description": "Especializada en carne asada.",
        "placeCategory": "Taquería de Asada",
        "isHealthPlace": false
    },
    {
        "Title": "Lonchería Nuevo Progreso",
        "Section": "taquerias_tacos_y_lonches",
        "Address": "Dirección no disponible",
        "Description": "Lonches, tortas y jugos frescos.",
        "placeCategory": "Lonchería",
        "isHealthPlace": false
    },
    {
        "Title": "Taquería El Güero",
        "Section": "taquerias_tacos_y_lonches",
        "Address": "Dirección no disponible",
        "Description": "Taquería popular y bien ubicada.",
        "placeCategory": "Taquería",
        "isHealthPlace": false
    },
    {
        "Title": "Taquería El Texitas",
        "Section": "taquerias_tacos_y_lonches",
        "Address": "Dirección no disponible",
        "Description": "Especializada en comida al estilo texano.",
        "placeCategory": "Taquería",
        "isHealthPlace": false
    },
    {
        "Title": "Taquería La Prima",
        "Section": "taquerias_tacos_y_lonches",
        "Address": "Dirección no disponible",
        "Description": "Tacos con opciones vegetarianas.",
        "placeCategory": "Taquería",
        "isHealthPlace": false
    },
    {
        "Title": "Barbacoa El Güero",
        "Section": "tacos_barbacoa",
        "Address": "Dirección no disponible",
        "Description": "Barbacoa tradicional de res o borrego.",
        "placeCategory": "Restaurante de Barbacoa",
        "isHealthPlace": false
    },
    {
        "Title": "Quesabirrias",
        "Section": "tacos_barbacoa",
        "Address": "Dirección no disponible",
        "Description": "Birria y quesabirrias jugosas.",
        "placeCategory": "Restaurante de Birria",
        "isHealthPlace": false
    },
    {
        "Title": "Barbacoa Candelo",
        "Section": "tacos_barbacoa",
        "Address": "Dirección no disponible",
        "Description": "Famosa por su barbacoa de fin de semana.",
        "placeCategory": "Restaurante de Barbacoa",
        "isHealthPlace": false
    },
    {
        "Title": "Barbacoa Oceguera 2",
        "Section": "tacos_barbacoa",
        "Address": "Dirección no disponible",
        "Description": "Segunda sucursal con el mismo sabor.",
        "placeCategory": "Restaurante de Barbacoa",
        "isHealthPlace": false
    },
    {
        "Title": "Taqueria Las Oceguera",
        "Section": "tacos_barbacoa",
        "Address": "Dirección no disponible",
        "Description": "Especialidad en tacos de barbacoa y guisados.",
        "placeCategory": "Taquería de Barbacoa",
        "isHealthPlace": false
    },
    {
        "Title": "Barbacoa Galerias",
        "Section": "tacos_barbacoa",
        "Address": "Dirección no disponible",
        "Description": "Barbacoa cerca del centro comercial Galerías.",
        "placeCategory": "Restaurante de Barbacoa",
        "isHealthPlace": false
    },
    {
        "Title": "Arturo's Restaurant",
        "Section": "restaurantes",
        "Address": "Dirección no disponible",
        "Description": "Restaurante con menú variado y servicio de bar.",
        "placeCategory": "Restaurante Internacional",
        "isHealthPlace": false
    },
    {
        "Title": "Chuy's Red Snapper",
        "Section": "restaurantes",
        "Address": "Dirección no disponible",
        "Description": "Famoso por su huachinango (red snapper).",
        "placeCategory": "Restaurante de Mariscos",
        "isHealthPlace": false
    },
    {
        "Title": "Angel’s Restaurant Bar",
        "Section": "restaurantes",
        "Address": "Dirección no disponible",
        "Description": "Comida mexicana y bebidas.",
        "placeCategory": "Restaurante y Bar",
        "isHealthPlace": false
    },
    {
        "Title": "Pancho’s Bar & Restaurant",
        "Section": "restaurantes",
        "Address": "Dirección no disponible",
        "Description": "Bar y restaurante con ambiente relajado.",
        "placeCategory": "Restaurante y Bar",
        "isHealthPlace": false
    },
    {
        "Title": "Renee's Restaurant & Bakery",
        "Section": "restaurantes",
        "Address": "Dirección no disponible",
        "Description": "Especializado en repostería y comidas caseras.",
        "placeCategory": "Restaurante y Panadería",
        "isHealthPlace": false
    },
    {
        "Title": "Tony’s Bar and Grill",
        "Section": "restaurantes",
        "Address": "Dirección no disponible",
        "Description": "Parrilla y bar con buena música.",
        "placeCategory": "Restaurante Parrilla",
        "isHealthPlace": false
    },
    {
        "Title": "Elsa’s Restaurant",
        "Section": "restaurantes",
        "Address": "Dirección no disponible",
        "Description": "Cocina regional y desayunos.",
        "placeCategory": "Restaurante Regional",
        "isHealthPlace": false
    },
    {
        "Title": "Café Sanchez",
        "Section": "restaurantes",
        "Address": "Dirección no disponible",
        "Description": "Cafetería y lugar de reunión.",
        "placeCategory": "Cafetería",
        "isHealthPlace": false
    },
    {
        "Title": "La Palapa de Nuevo Progreso",
        "Section": "restaurantes",
        "Address": "Dirección no disponible",
        "Description": "Restaurante con vista a la calle principal.",
        "placeCategory": "Restaurante Mexicano",
        "isHealthPlace": false
    },
    {
        "Title": "Mariscos Progreso",
        "Section": "restaurantes",
        "Address": "Dirección no disponible",
        "Description": "Especializado en pescados y mariscos frescos.",
        "placeCategory": "Restaurante de Mariscos",
        "isHealthPlace": false
    },
    {
        "Title": "La Terraza (restaurant)",
        "Section": "restaurantes",
        "Address": "Dirección no disponible",
        "Description": "Comida internacional y terraza con ambiente.",
        "placeCategory": "Restaurante Internacional",
        "isHealthPlace": false
    },
    {
        "Title": "Cocina Real",
        "Section": "restaurantes",
        "Address": "Dirección no disponible",
        "Description": "Comida casera y tradicional mexicana.",
        "placeCategory": "Restaurante Casero",
        "isHealthPlace": false
    },
    {
        "Title": "Estetica Modelo",
        "Section": "salones_belleza",
        "Address": "Dirección no disponible",
        "Description": "Estética con servicios de corte y peinado.",
        "placeCategory": "Estética",
        "isHealthPlace": true
    },
    {
        "Title": "Angie's Beauty Salon",
        "Section": "salones_belleza",
        "Address": "Dirección no disponible",
        "Description": "Salón de belleza completo.",
        "placeCategory": "Salón de Belleza",
        "isHealthPlace": true
    },
    {
        "Title": "Glorias Barber Shop",
        "Section": "salones_belleza",
        "Address": "Dirección no disponible",
        "Description": "Barbería clásica para caballeros.",
        "placeCategory": "Barbería",
        "isHealthPlace": true
    },
    {
        "Title": "Erika's Beauty Salon",
        "Section": "salones_belleza",
        "Address": "Dirección no disponible",
        "Description": "Servicios de coloración y tratamientos capilares.",
        "placeCategory": "Salón de Belleza",
        "isHealthPlace": true
    },
    {
        "Title": "Bellas Beauty Salon",
        "Section": "salones_belleza",
        "Address": "Dirección no disponible",
        "Description": "Salón enfocado en servicios de uñas y cabello.",
        "placeCategory": "Salón de Belleza y Uñas",
        "isHealthPlace": true
    },
    {
        "Title": "Almitas Spa",
        "Section": "salones_belleza",
        "Address": "Dirección no disponible",
        "Description": "Spa y salón de belleza con masajes.",
        "placeCategory": "Spa y Salón",
        "isHealthPlace": true
    },
    {
        "Title": "Peluquería Gerson",
        "Section": "salones_belleza",
        "Address": "Dirección no disponible",
        "Description": "Peluquería tradicional con experiencia.",
        "placeCategory": "Peluquería",
        "isHealthPlace": true
    },
    {
        "Title": "Peluquería Marin",
        "Section": "salones_belleza",
        "Address": "Dirección no disponible",
        "Description": "Servicios de corte para toda la familia.",
        "placeCategory": "Peluquería",
        "isHealthPlace": true
    },
    {
        "Title": "Peluquería Palmolive",
        "Section": "salones_belleza",
        "Address": "Dirección no disponible",
        "Description": "Peluquería con productos de calidad.",
        "placeCategory": "Peluquería",
        "isHealthPlace": true
    },
    {
        "Title": "Salón de Belleza Renova",
        "Section": "salones_belleza",
        "Address": "Dirección no disponible",
        "Description": "Renovación de imagen y tratamientos de belleza.",
        "placeCategory": "Salón de Belleza",
        "isHealthPlace": true
    },
    {
        "Title": "Estética Mary",
        "Section": "salones_belleza",
        "Address": "Dirección no disponible",
        "Description": "Estética con especialidad en maquillaje.",
        "placeCategory": "Estética y Maquillaje",
        "isHealthPlace": true
    },
    {
        "Title": "Charly's by Galerias (artesanías)",
        "Section": "tiendas_artesanias",
        "Address": "Dirección no disponible",
        "Description": "Tienda de souvenirs y artesanías cerca de Galerías.",
        "placeCategory": "Tienda de Artesanías",
        "isHealthPlace": false
    },
    {
        "Title": "El Disco Super Center (artesanías y souvenirs)",
        "Section": "tiendas_artesanias",
        "Address": "Dirección no disponible",
        "Description": "Gran tienda con artesanías y otros productos.",
        "placeCategory": "Tienda de Regalos",
        "isHealthPlace": false
    },
    {
        "Title": "Mercado Faro (puestos de artesanías)",
        "Section": "tiendas_artesanias",
        "Address": "Dirección no disponible",
        "Description": "Mercado con una variedad de puestos de artesanías locales.",
        "placeCategory": "Mercado de Artesanías",
        "isHealthPlace": false
    },
    {
        "Title": "Papelería y Novedades Chihd",
        "Section": "tiendas_artesanias",
        "Address": "Dirección no disponible",
        "Description": "Papelería y venta de artículos novedosos.",
        "placeCategory": "Papelería y Novedades",
        "isHealthPlace": false
    },
    {
        "Title": "Mi Lindo Oaxaca (souvenirs)",
        "Section": "tiendas_artesanias",
        "Address": "Dirección no disponible",
        "Description": "Especializada en productos y souvenirs de Oaxaca.",
        "placeCategory": "Tienda de Souvenirs",
        "isHealthPlace": false
    },
    {
        "Title": "Tienda de Artesanías Shaddai",
        "Section": "tiendas_artesanias",
        "Address": "Dirección no disponible",
        "Description": "Artesanías hechas a mano y regalos.",
        "placeCategory": "Tienda de Artesanías",
        "isHealthPlace": false
    },
    {
        "Title": "Galerías",
        "Section": "tiendas_artesanias",
        "Address": "Dirección no disponible",
        "Description": "Centro comercial con varias tiendas y servicios.",
        "placeCategory": "Centro Comercial",
        "isHealthPlace": false
    },
    {
        "Title": "Canada Store",
        "Section": "tiendas_artesanias",
        "Address": "Dirección no disponible",
        "Description": "Tienda con productos importados.",
        "placeCategory": "Tienda de Productos Importados",
        "isHealthPlace": false
    },
    {
        "Title": "Panchos",
        "Section": "tiendas_artesanias",
        "Address": "Dirección no disponible",
        "Description": "Tienda variada con artículos populares.",
        "placeCategory": "Tienda Variada",
        "isHealthPlace": false
    },
    {
        "Title": "La catrina",
        "Section": "tiendas_artesanias",
        "Address": "Dirección no disponible",
        "Description": "Tienda temática de artesanías mexicanas.",
        "placeCategory": "Tienda de Artesanías",
        "isHealthPlace": false
    },
    {
        "Title": "Kokopelli",
        "Section": "tiendas_artesanias",
        "Address": "Dirección no disponible",
        "Description": "Tienda de regalos y artesanías originales.",
        "placeCategory": "Tienda de Regalos",
        "isHealthPlace": false
    },
    {
        "Title": "Farmacia Economy",
        "Section": "farmacias",
        "Address": "Dirección no disponible",
        "Description": "Farmacia con precios económicos.",
        "placeCategory": "Farmacia",
        "isHealthPlace": true
    },
    {
        "Title": "Pancho's Pharmacy",
        "Section": "farmacias",
        "Address": "Dirección no disponible",
        "Description": "Farmacia de servicio completo.",
        "placeCategory": "Farmacia",
        "isHealthPlace": true
    },
    {
        "Title": "Farmacias Benavides (sucursal local)",
        "Section": "farmacias",
        "Address": "Dirección no disponible",
        "Description": "Cadena de farmacias reconocida en México.",
        "placeCategory": "Farmacia",
        "isHealthPlace": true
    },
    {
        "Title": "Progreso Pharmacy",
        "Section": "farmacias",
        "Address": "Dirección no disponible",
        "Description": "Farmacia local enfocada en la atención al turista.",
        "placeCategory": "Farmacia",
        "isHealthPlace": true
    },
    {
        "Title": "Farmacia Linda",
        "Section": "farmacias",
        "Address": "Dirección no disponible",
        "Description": "Farmacia pequeña con atención personalizada.",
        "placeCategory": "Farmacia",
        "isHealthPlace": true
    },
    {
        "Title": "Farmacia Centro Médico",
        "Section": "farmacias",
        "Address": "Dirección no disponible",
        "Description": "Ubicada cerca del área de consultorios médicos.",
        "placeCategory": "Farmacia",
        "isHealthPlace": true
    },
    {
        "Title": "Farmacias de Nuevo Progreso (grupo local)",
        "Section": "farmacias",
        "Address": "Dirección no disponible",
        "Description": "Grupo de farmacias con varias ubicaciones en la ciudad.",
        "placeCategory": "Farmacia",
        "isHealthPlace": true
    },
    {
        "Title": "Farmacia US",
        "Section": "farmacias",
        "Address": "Dirección no disponible",
        "Description": "Especializada en productos que provienen del lado americano.",
        "placeCategory": "Farmacia",
        "isHealthPlace": true
    },
    {
        "Title": "Farmacia Roma",
        "Section": "farmacias",
        "Address": "Dirección no disponible",
        "Description": "Farmacia con servicio a domicilio.",
        "placeCategory": "Farmacia",
        "isHealthPlace": true
    },
    {
        "Title": "Farmacia All Most Free",
        "Section": "farmacias",
        "Address": "Dirección no disponible",
        "Description": "Conocida por ofrecer descuentos.",
        "placeCategory": "Farmacia",
        "isHealthPlace": true
    },
    {
        "Title": "Farmacia Similares",
        "Section": "farmacias",
        "Address": "Dirección no disponible",
        "Description": "Cadena de farmacias con medicamentos genéricos.",
        "placeCategory": "Farmacia",
        "isHealthPlace": true
    },
    {
        "Title": "Farmacia Queen",
        "Section": "farmacias",
        "Address": "Dirección no disponible",
        "Description": "Farmacia con venta de medicamentos especializados.",
        "placeCategory": "Farmacia",
        "isHealthPlace": true
    },
    {
        "Title": "Óptica Progreso",
        "Section": "opticas",
        "Address": "Dirección no disponible",
        "Description": "Óptica con examen de la vista y lentes.",
        "placeCategory": "Óptica",
        "isHealthPlace": true
    },
    {
        "Title": "Óptica Las Flores",
        "Section": "opticas",
        "Address": "Dirección no disponible",
        "Description": "Óptica con amplia selección de armazones.",
        "placeCategory": "Óptica",
        "isHealthPlace": true
    },
    {
        "Title": "Vision Center Progreso",
        "Section": "opticas",
        "Address": "Dirección no disponible",
        "Description": "Centro de visión con especialistas.",
        "placeCategory": "Centro de Visión",
        "isHealthPlace": true
    },
    {
        "Title": "Laboratorio de Lentes Progreso",
        "Section": "opticas",
        "Address": "Dirección no disponible",
        "Description": "Laboratorio para la fabricación de lentes.",
        "placeCategory": "Laboratorio de Lentes",
        "isHealthPlace": true
    },
    {
        "Title": "Óptica La Plaza",
        "Section": "opticas",
        "Address": "Dirección no disponible",
        "Description": "Ubicada convenientemente cerca de la plaza central.",
        "placeCategory": "Óptica",
        "isHealthPlace": true
    }
];

// Mapeo de intención de usuario a Secciones de JSON y Query de API de Places
const CATEGORY_MAP = {
    // Patrón de Búsqueda -> { Secciones JSON, Query API de Places (para Google Search) }
    'tacos': {
        sections: ['taquerias_tacos_y_lonches', 'tacos_barbacoa'], 
        apiQuery: 'Taquerías y Tacos en Nuevo Progreso'
    },
    'taqueria': {
        sections: ['taquerias_tacos_y_lonches', 'tacos_barbacoa'], 
        apiQuery: 'Taquerías y Tacos en Nuevo Progreso'
    },
    'barbacoa': {
        sections: ['tacos_barbacoa'], 
        apiQuery: 'Barbacoa y Birria Nuevo Progreso'
    },
    'restaurante': {
        sections: ['restaurantes'], 
        apiQuery: 'Restaurantes en Nuevo Progreso'
    },
    'comer': {
        sections: ['restaurantes', 'taquerias_tacos_y_lonches'], // Ampliado para incluir lonches y tacos
        apiQuery: 'Comida en Nuevo Progreso'
    },
    'artesanias': {
        sections: ['tiendas_artesanias'], 
        apiQuery: 'Tiendas de Artesanías y Souvenirs en Nuevo Progreso'
    },
    'souvenirs': {
        sections: ['tiendas_artesanias'], 
        apiQuery: 'Tiendas de Artesanías y Souvenirs en Nuevo Progreso'
    },
    'clinica dental': {
        sections: ['clinicas_dentales'], 
        apiQuery: 'Clínicas Dentales Nuevo Progreso'
    },
    'dentista': {
        sections: ['clinicas_dentales'], 
        apiQuery: 'Clínicas Dentales Nuevo Progreso'
    },
    'farmacia': {
        sections: ['farmacias'], 
        apiQuery: 'Farmacias en Nuevo Progreso'
    },
    'belleza': {
        sections: ['salones_belleza'], 
        apiQuery: 'Salones de Belleza y Peluquerías Nuevo Progreso'
    },
    'peluqueria': {
        sections: ['salones_belleza'], 
        apiQuery: 'Peluquerías y Barberías Nuevo Progreso'
    },
    'optica': {
        sections: ['opticas'], 
        apiQuery: 'Ópticas en Nuevo Progreso'
    },
    // Añadir más categorías según sea necesario
};


/**
 * ⚠️ CAMBIO CLAVE: Esta función ya no lee de un archivo.
 * Simplemente devuelve el array de datos locales incrustado arriba (PROGRESO_DATA).
 */
async function getProgresoData() {
    // Si necesitas volver a usar el archivo, descomenta el código de abajo
    /*
    const filePath = path.join(process.cwd(), 'progreso_data.json');
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
    */

    // Retornamos el array de datos incrustados.
    return PROGRESO_DATA;
}


// Expresión regular para detectar peticiones de listados (ej: 'dime 4 taquerias')
const recommendationPattern = /dime|dame|muéstrame|quiero|lista|recomiéndame|conozco|lugares|top/i;
// Expresión para limpiar el JSON incrustado de la respuesta de Gemini
const jsonRegex = /```json\s*([\s\S]*?)\s*```/;

// --- Inicialización de APIs ---
const ai = new GoogleGenAI({});
const placesClient = new PlacesClient({});
// -----------------------------


// --- Instrucción Principal del Sistema para Gemini ---
// CLAVE: Define el comportamiento, tono y formato de salida JSON.
const BASE_SYSTEM_INSTRUCTION = `Eres Progreso Tour Guide, un asistente virtual amable y experto en la ciudad fronteriza de Nuevo Progreso, Tamaulipas.
Tu objetivo es ayudar a los usuarios con información específica de la ciudad, siempre en español.

Reglas CLAVE:
1. Siempre debes verificar si la consulta del usuario se refiere a un lugar de SALUD (ej. clínica dental, farmacia, estética).
2. Si la consulta es sobre SALUD, la propiedad "isHealthPlace" en tu respuesta JSON debe ser OBLIGATORIAMENTE 'true'. Si no es de salud, debe ser 'false'.
3. **Formato de Respuesta:** Para la mayoría de las respuestas (especialmente recomendaciones de lugares específicos), debes responder ÚNICAMENTE con una estructura JSON siguiendo este esquema. NO DEBE HABER TEXTO ADICIONAL FUERA DEL JSON si respondes con JSON.

ESQUEMA JSON:
{
    "Title": "El título que elijas para el lugar",
    "Description": "Descripción amable y concisa del lugar.",
    "placeCategory": "Categoría del lugar (ej. Taquería, Restaurante de Mariscos, Tienda de Artesanías)",
    "isStructured": true,
    "isHealthPlace": [true/false], // OBLIGATORIO: true si es salud (dental, farmacia, salón), false si es comida/tienda
    "mapUrl": "https://support.google.com/maps/answer/3094088?hl=es", 
    "reviewUrl": "https://support.google.com/business/thread/157698752/rese%C3%91as-falsa-es-obvio-pero-google-pasa-de-todo?hl=es",
    "placePhone": "[Número de teléfono, puedes dejarlo nulo si es recomendación local forzada]"
}

4. Si la consulta es general (ej. 'Hola', '¿Cómo estás?'), responde con texto plano y un tono amigable, sin usar el formato JSON.
5. El tono debe ser siempre servicial y conciso.`;
// ----------------------------------------------------


// --- Manejador de la API ---
export default async function handler(req, res) {
    // Solo permitimos peticiones POST
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    // El frontend espera 'history' (array) y 'userPrompt' (string)
    const { history, userPrompt } = req.body;
    if (!userPrompt || !Array.isArray(history)) {
        return res.status(400).json({ message: 'Invalid request payload' });
    }

    // Bandera para saber si activamos el protocolo de recomendación local
    let isLocalRecommendation = false; 
    let finalUserPrompt = userPrompt;
    let totalResultsCount = 0;
    let apiQueryForChip = '';

    try {
        // =========================================================================
        // 1. PROTOCOLO DE RECOMENDACIÓN LOCAL (Fuerza el uso de la lista)
        // =========================================================================

        // a. Intentar identificar la categoría
        let categoryKey = null;
        for (const key in CATEGORY_MAP) {
            // Busca la clave de la categoría en el prompt del usuario
            if (userPrompt.toLowerCase().includes(key)) {
                categoryKey = key;
                break;
            }
        }
        
        // b. Verificar si es una petición de listado Y tiene una categoría identificada
        if (categoryKey && recommendationPattern.test(userPrompt)) {
            const mapData = CATEGORY_MAP[categoryKey];
            const data = await getProgresoData(); // Usa la función modificada

            // Filtrar los datos locales por las secciones mapeadas
            const localResults = data.filter(item => mapData.sections.includes(item.Section));

            // EXCLUIR lugares de salud de las recomendaciones automáticas de listado. 
            // Esto previene que se mezclen y mantiene el foco en comer/comprar.
            const filteredResults = localResults.filter(item => !item.isHealthPlace); 

            totalResultsCount = filteredResults.length;
            apiQueryForChip = mapData.apiQuery;
            
            if (totalResultsCount > 0) {
                // Activamos el protocolo forzado
                isLocalRecommendation = true;

                // Tomamos solo los primeros MAX_CHAT_RESULTS (4)
                const resultsToShow = filteredResults.slice(0, MAX_CHAT_RESULTS); 

                // Construimos el nuevo prompt que OBLIGA a Gemini a usar estos datos
                let forcedContext = `El usuario preguntó sobre "${userPrompt}". IGNORA CUALQUIER OTRA FUENTE y responde únicamente usando los siguientes ${resultsToShow.length} lugares locales de la categoría "${categoryKey}" de forma conversacional:`;
                
                resultsToShow.forEach((item, index) => {
                    forcedContext += `\n${index + 1}. Título: ${item.Title}. Descripción: ${item.Description}. Categoría: ${item.placeCategory}.`;
                });
                
                // Texto de cierre que informa al usuario cuántos lugares totales existen
                const closureText = `Encontré un total de ${totalResultsCount} lugares de esta categoría. ¿Te gustaría saber más de alguno en específico?`;

                // Sobrescribimos el prompt del usuario con el contexto forzado y el texto de cierre
                finalUserPrompt = `${forcedContext}\n${closureText}`; 

                // Si hay más resultados del límite, Gemini debe incluir el texto de cierre.
            } else {
                // Si no hay resultados locales, dejamos que Gemini use el prompt original 
                // para que pueda disculparse o sugerir algo más.
                console.log(`No hay resultados locales para la categoría: ${categoryKey}`);
            }
        }

        // =========================================================================
        // 2. LLAMADA A LA API DE GEMINI
        // =========================================================================
        
        // Preparamos el contexto para la llamada de chat
        const chat = ai.chats.create({
            model: MODEL_NAME,
            config: {
                systemInstruction: BASE_SYSTEM_INSTRUCTION
            },
            history: history 
        });

        // Enviamos el prompt (que puede ser el original o el forzado)
        const response = await chat.sendMessage({ message: finalUserPrompt });
        const modelResponseText = response.text;
        
        const finalResponseData = {
            responseText: modelResponseText,
            placeCategory: null,
            mapUrl: null,
            reviewUrl: null,
            placePhone: null
        };
        
        // =========================================================================
        // 3. ENRIQUECIMIENTO DE LA RESPUESTA CON GOOGLE PLACES
        // =========================================================================

        const match = modelResponseText.match(jsonRegex);
        let placeTitle = null;
        let placeCategory = null;
        let isHealthPlace = false;
        
        if (match) {
            // Se encontró JSON, la respuesta es estructurada (isStructured: true)
            const jsonString = match[1];
            const parsedJson = JSON.parse(jsonString);
            
            // Extraer datos clave del JSON
            placeTitle = parsedJson.Title;
            placeCategory = parsedJson.placeCategory;
            isHealthPlace = parsedJson.isHealthPlace || false; // Asegurar que es false si no existe
            
            // Actualizar la estructura de respuesta final
            finalResponseData.placeCategory = placeCategory;

            // Lógica de seguridad para lugares de salud
            if (isHealthPlace) {
                // ⚠️ REGLA DE PRIVACIDAD: Si es un lugar de salud, NO buscamos teléfono ni reseñas.
                finalResponseData.responseText = modelResponseText.replace(jsonString, '').trim();
                finalResponseData.responseText = finalResponseData.responseText.trim() + '\n' + JSON.stringify({ ...parsedJson, placePhone: null, reviewUrl: null, mapUrl: null });
                console.log(`Seguridad aplicada: Datos de contacto bloqueados para ${placeTitle}.`);
            } else if (placeTitle) {
                // Si NO es de salud, y tenemos un título, buscamos más detalles.
                console.log(`Buscando detalles de Google Places para: ${placeTitle}`);
                
                // Usamos el cliente de Places (asume que Places API está configurada)
                const placesResponse = await placesClient.findPlaceFromText({
                    params: {
                        input: `${placeTitle} Nuevo Progreso`,
                        inputtype: 'textquery',
                        fields: ['place_id', 'formatted_address', 'name', 'rating', 'user_ratings_total'],
                        key: process.env.GOOGLE_PLACES_API_KEY, 
                    },
                    timeout: 2000,
                });

                if (placesResponse.data.candidates.length > 0) {
                    const place = placesResponse.data.candidates[0];
                    
                    // Buscar detalles específicos (teléfono, URL, etc.)
                    const detailsResponse = await placesClient.getDetails({
                        params: {
                            place_id: place.place_id,
                            fields: ['url', 'website', 'formatted_phone_number'],
                            key: process.env.GOOGLE_PLACES_API_KEY, 
                        },
                        timeout: 2000,
                    });

                    const details = detailsResponse.data.result;

                    // Construcción de URLs
                    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeTitle)}&query_place_id=${place.place_id}`;
                    const reviewsUrl = details.url || mapsUrl; // Usar la URL de Maps si no hay otra

                    // Actualizar la respuesta final
                    finalResponseData.mapUrl = mapsUrl;
                    finalResponseData.reviewUrl = reviewsUrl;
                    finalResponseData.placePhone = details.formatted_phone_number || null;

                    // Reconstruir el JSON para el frontend con los datos enriquecidos
                    const enrichedJson = {
                        ...parsedJson,
                        mapUrl: finalResponseData.mapUrl,
                        reviewUrl: finalResponseData.reviewUrl,
                        placePhone: finalResponseData.placePhone,
                    };

                    // Reemplazar el JSON original en el texto de Gemini con el enriquecido
                    const cleanedResponseText = modelResponseText.replace(jsonString, '').trim();
                    finalResponseData.responseText = cleanedResponseText + '\n' + JSON.stringify(enrichedJson);
                } else {
                    // Si falla el place search, volvemos al JSON original (solo limpiamos el JSON de los backticks)
                    finalResponseData.responseText = modelResponseText.replace(jsonString, '').trim() + '\n' + JSON.stringify(parsedJson);
                    console.log(`No se encontraron candidatos de Places API para: ${placeTitle}`);
                }
            } else {
                 // Si falla el parseo o no hay título, la respuesta sigue siendo la original (texto plano)
                 finalResponseData.responseText = modelResponseText.replace(jsonString, '').trim();
                 finalResponseData.responseText = finalResponseData.responseText.trim() + '\n' + JSON.stringify(parsedJson);
            }
        } else {
            // Si no hay match (es texto plano), se usa la respuesta tal cual
            // Si falla el parseo, la respuesta sigue siendo la original (texto plano)
            finalResponseData.responseText = modelResponseText; 
        }

        // =========================================================================
        // 4. LÓGICA DE ANEXAR METADATOS DE RECOMENDACIÓN LOCAL AL FINAL DE LA RESPUESTA
        // Esto solo ocurre si el protocolo fue activado (isLocalRecommendation = true) 
        // y la respuesta final NO es JSON estructurado (es texto plano de Gemini, el listado)
        // =========================================================================
        if (isLocalRecommendation && !finalResponseData.responseText.includes('"isStructured": true')) {
             if (totalResultsCount > MAX_CHAT_RESULTS) {
                // Si el conteo total excede el límite (4), anexamos los metadatos para el frontend
                const metaData = {
                    isLocalRecommendation: true,
                    totalCount: totalResultsCount,
                    apiQueryForChip: apiQueryForChip // CLAVE para el botón "Ver todos"
                };
                // Anexamos el JSON al final del texto de Gemini
                finalResponseData.responseText = finalResponseData.responseText.trim() + '\n' + JSON.stringify(metaData);
            }
        }

        // Retornamos la respuesta (enriquecida o original) al frontend
        res.status(200).json(finalResponseData);

    } catch (error) {
        console.error("Error en la API de Gemini o en el procesamiento:", error);
        res.status(500).json({ 
            error: true, 
            message: "Fallo al obtener respuesta de Gemini: " + error.message
        });
    }
}
