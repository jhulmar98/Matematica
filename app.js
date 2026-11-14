"use strict";

/* CONFIGURACIÓN */
const CLAVE_GUARDADO = "control-descarte-v4";

const EMPRESAS = [
  { id: "larama", nombre: "Larama" },
  { id: "aga", nombre: "Aga" },
  { id: "arenuva", nombre: "Arenuva" }
];

const CAMPOS = [
  { id: "toneladas", decimales: 3, inicial: "0.000" },
  { id: "precio", decimales: 2, inicial: "8.97" },
  { id: "saldo", decimales: 2, inicial: "0.00" },
  { id: "excedente", decimales: 2, inicial: "0.00" }
];

const $ = (id) => document.getElementById(id);

let totalMensaje = null;
let archivoImagen = null;
let urlImagen = null;

/* MENSAJES */
function mostrarEstado(texto) {
  $("estado").textContent = texto;
}

function mostrarEstadoImagen(texto) {
  $("estado-imagen").textContent = texto;
}

/* NÚMEROS EXACTOS */
function convertir(valor, decimales) {
  const texto = String(valor).trim();

  const patron = new RegExp(
    `^(?:\\d+|\\d{1,3}(?:,\\d{3})+)(?:\\.\\d{1,${decimales}})?$`
  );

  if (!patron.test(texto)) {
    throw new Error("Número incorrecto");
  }

  const [entero, fraccion = ""] = texto
    .replaceAll(",", "")
    .split(".");

  if (BigInt(entero) > 999999999n) {
    throw new Error("Cantidad demasiado grande");
  }

  return (
    BigInt(entero) * 10n ** BigInt(decimales) +
    BigInt(fraccion.padEnd(decimales, "0"))
  );
}

function decimalExacto(valor, decimales) {
  const negativo = valor < 0n;
  const absoluto = negativo ? -valor : valor;

  const texto = absoluto
    .toString()
    .padStart(decimales + 1, "0");

  return (
    (negativo ? "-" : "") +
    texto.slice(0, -decimales) +
    "." +
    texto.slice(-decimales)
  );
}

function formatear(valor, decimales) {
  const [entero, fraccion] = decimalExacto(
    valor,
    decimales
  ).split(".");

  return (
    entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    "." +
    fraccion
  );
}

function dinero(valor) {
  return `S/ ${formatear(valor, 2)}`;
}

function sumar(datos, campo) {
  return datos.reduce(
    (total, empresa) => total + empresa[campo],
    0n
  );
}

/* LEER Y CALCULAR */
function leerDatos() {
  return EMPRESAS.map((empresa) => {
    const datos = { ...empresa };
    let valido = true;

    CAMPOS.forEach((campo) => {
      const entrada = $(`${empresa.id}-${campo.id}`);

      try {
        datos[campo.id] = convertir(
          entrada.value,
          campo.decimales
        );

        entrada.setCustomValidity("");
        entrada.removeAttribute("aria-invalid");
      } catch {
        entrada.setCustomValidity(
          `Escribe un número desde cero con hasta ${campo.decimales} decimales. Usa coma para miles y punto para decimales.`
        );

        entrada.setAttribute("aria-invalid", "true");
        valido = false;
      }
    });

    if (!valido) return null;

    // Importe redondeado a céntimos por empresa.
    datos.importe =
      (datos.toneladas * datos.precio + 500n) / 1000n;

    // Total = importe + saldo pendiente − abonado de más.
    datos.total =
      datos.importe + datos.saldo - datos.excedente;

    return datos;
  });
}

/* COMPROBAR DESCARTE TOTAL */
function comprobarTotal() {
  let suma = 0n;
  let valido = true;

  EMPRESAS.forEach((empresa) => {
    try {
      suma += convertir(
        $(`${empresa.id}-toneladas`).value,
        3
      );
    } catch {
      valido = false;
    }
  });

  const panel = $("comprobacion");
  const resultado = $("resultado-comprobacion");

  $("descarte-total-mensaje").textContent =
    totalMensaje === null
      ? "—"
      : `${formatear(totalMensaje, 3)} t`;

  $("descarte-total-calculado").textContent =
    valido ? `${formatear(suma, 3)} t` : "—";

  if (!valido) {
    panel.dataset.estado = "error";
    $("descarte-diferencia").textContent = "—";

    resultado.textContent =
      "Revisa las toneladas para comprobar el total.";

    return {
      estado: "error",
      texto: resultado.textContent,
      suma: null,
      diferencia: null
    };
  }

  if (totalMensaje === null) {
    panel.dataset.estado = "pendiente";
    $("descarte-diferencia").textContent = "—";

    resultado.textContent =
      "Pega el mensaje y pulsa “Completar y comprobar”.";

    return {
      estado: "pendiente",
      texto: "Sin descarte total de referencia.",
      suma,
      diferencia: null
    };
  }

  const diferencia = suma - totalMensaje;

  $("descarte-diferencia").textContent =
    `${formatear(diferencia, 3)} t`;

  const coincide = diferencia === 0n;

  panel.dataset.estado = coincide ? "correcto" : "error";

  resultado.textContent = coincide
    ? "CORRECTO: la suma coincide con el descarte total."
    : "NO COINCIDE: revisa las cantidades. La diferencia es la suma de las empresas menos el total del mensaje.";

  return {
    estado: coincide ? "correcto" : "error",
    texto: resultado.textContent,
    suma,
    diferencia
  };
}

/* MOSTRAR RESULTADOS */
function actualizar(guardar = true) {
  const datos = leerDatos();

  datos.forEach((empresa, indice) => {
    $(`${EMPRESAS[indice].id}-total`).textContent =
      empresa ? dinero(empresa.total) : "—";
  });

  const comprobacion = comprobarTotal();

  if (datos.some((empresa) => empresa === null)) {
    $("total-toneladas").textContent = "—";
    $("total-general").textContent = "—";

    mostrarEstado(
      "Revisa los campos marcados. Los cambios incompletos no se guardan."
    );

    return null;
  }

  $("total-toneladas").textContent =
    `${formatear(sumar(datos, "toneladas"), 3)} t`;

  $("total-general").textContent =
    dinero(sumar(datos, "total"));

  if (guardar && guardarDatos()) {
    let aviso = "Datos guardados.";

    if (comprobacion.estado === "error") {
      aviso += " El descarte total no coincide.";
    }

    if (datos.some((empresa) => empresa.total < 0n)) {
      aviso += " Un total negativo indica saldo a favor.";
    }

    mostrarEstado(aviso);
  }

  return datos;
}

/* IMPORTAR MENSAJE */
function importarMensaje() {
  const original = $("mensaje-stock").value.trim();

  if (!original) {
    mostrarEstado("Primero pega el mensaje completo.");
    $("mensaje-stock").focus();
    return;
  }

  const texto = original
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[*_`]/g, "")
    .replace(/\\[ \t]*(?=\n|$)/g, "");

  function extraerCantidad(linea, nombre) {
    const coincidencia = linea.trim().match(
      /^([0-9][0-9,.]*)(?=\s|$)/
    );

    if (!coincidencia) {
      throw new Error(
        `${nombre}: no se pudo leer la cantidad.`
      );
    }

    try {
      return convertir(coincidencia[1], 3);
    } catch {
      throw new Error(
        `${nombre}: revisa el número. Usa coma para miles, punto para decimales y hasta tres decimales.`
      );
    }
  }

  try {
    const generales = [
      ...texto.matchAll(
        /^[ \t]*DESCARTE[ \t]+TOTAL[ \t]*:[ \t]*([^\n]*)$/gim
      )
    ];

    if (generales.length !== 1) {
      throw new Error(
        "Incluye una sola línea DESCARTE TOTAL: con su cantidad."
      );
    }

    const esperado = extraerCantidad(
      generales[0][1],
      "DESCARTE TOTAL"
    );

    const encabezados = [
      ...texto.matchAll(
        /^[ \t]*(LARAMA|AGA|ARENUVA)[ \t]*:[ \t]*/gim
      )
    ];

    const cantidades = new Map();

    encabezados.forEach((encabezado, indice) => {
      const id = encabezado[1].toLowerCase();

      const empresa = EMPRESAS.find(
        (item) => item.id === id
      );

      if (cantidades.has(id)) {
        throw new Error(
          `${empresa.nombre} aparece más de una vez.`
        );
      }

      const inicio =
        encabezado.index + encabezado[0].length;

      const fin =
        encabezados[indice + 1]?.index ?? texto.length;

      const bloque = texto.slice(inicio, fin);

      // Ignora campo, packing y cualquier otra línea.
      const totales = [
        ...bloque.matchAll(
          /^[ \t]*TOTAL[ \t]*:[ \t]*([^\n]*)$/gim
        )
      ];

      if (totales.length !== 1) {
        throw new Error(
          `${empresa.nombre} debe tener una sola línea TOTAL:.`
        );
      }

      cantidades.set(
        id,
        extraerCantidad(totales[0][1], empresa.nombre)
      );
    });

    const faltantes = EMPRESAS.filter(
      (empresa) => !cantidades.has(empresa.id)
    );

    if (faltantes.length) {
      throw new Error(
        "Falta el total de: " +
        faltantes.map((empresa) => empresa.nombre).join(", ") +
        "."
      );
    }

    // Aplicar solo después de validar todo el mensaje.
    cantidades.forEach((cantidad, id) => {
      const entrada = $(`${id}-toneladas`);

      entrada.value = formatear(cantidad, 3);
      entrada.setCustomValidity("");
      entrada.removeAttribute("aria-invalid");
    });

    totalMensaje = esperado;

    const datos = actualizar();
    const comprobacion = comprobarTotal();

    let aviso =
      comprobacion.estado === "correcto"
        ? "Totales completados. El descarte total coincide."
        : "Totales completados, pero el descarte total NO coincide. Revisa la diferencia.";

    aviso += " Se copiaron los números sin convertir unidades.";

    if (!datos) {
      aviso += " Corrige los otros campos para guardar.";
    }

    mostrarEstado(aviso);
  } catch (error) {
    mostrarEstado(
      error.message + " No se modificaron las tablas."
    );
  }
}

/* GUARDADO LOCAL */
function guardarDatos() {
  const valores = {};

  EMPRESAS.forEach((empresa) => {
    CAMPOS.forEach((campo) => {
      const id = `${empresa.id}-${campo.id}`;
      valores[id] = $(id).value;
    });
  });

  const datos = {
    version: 2,
    valores,
    mensaje: $("mensaje-stock").value,
    totalMensaje:
      totalMensaje === null
        ? null
        : decimalExacto(totalMensaje, 3)
  };

  try {
    localStorage.setItem(
      CLAVE_GUARDADO,
      JSON.stringify(datos)
    );

    return true;
  } catch {
    mostrarEstado(
      "No se pudo guardar en este navegador. Descarga el Excel para conservar los datos."
    );

    return false;
  }
}

function cargarDatos() {
  try {
    const texto = localStorage.getItem(CLAVE_GUARDADO);

    if (!texto) return "nuevo";

    const guardado = JSON.parse(texto);
    const nuevoFormato = guardado.version === 2;

    const valores = nuevoFormato
      ? guardado.valores
      : guardado;

    EMPRESAS.forEach((empresa) => {
      CAMPOS.forEach((campo) => {
        const id = `${empresa.id}-${campo.id}`;

        if (typeof valores?.[id] !== "string") {
          throw new Error("Datos incompletos");
        }

        convertir(valores[id], campo.decimales);
      });
    });

    let referencia = null;

    if (nuevoFormato && guardado.totalMensaje !== null) {
      referencia = convertir(
        guardado.totalMensaje,
        3
      );
    }

    EMPRESAS.forEach((empresa) => {
      CAMPOS.forEach((campo) => {
        const id = `${empresa.id}-${campo.id}`;
        $(id).value = valores[id];
      });
    });

    totalMensaje = referencia;

    if (nuevoFormato && typeof guardado.mensaje === "string") {
      $("mensaje-stock").value = guardado.mensaje;
    }

    return "recuperado";
  } catch {
    return "error";
  }
}

/* REEMPLAZAR VALOR AL TOCAR Y ESCRIBIR */
function prepararEntrada(entrada) {
  let pendiente = null;

  function cancelar() {
    if (pendiente !== null) {
      cancelAnimationFrame(pendiente);
      pendiente = null;
    }
  }

  function seleccionar() {
    cancelar();

    pendiente = requestAnimationFrame(() => {
      pendiente = null;

      if (document.activeElement === entrada) {
        entrada.select();
      }
    });
  }

  entrada.addEventListener("focus", seleccionar);
  entrada.addEventListener("click", seleccionar);

  entrada.addEventListener("input", () => {
    cancelar();
    actualizar();
  });

  entrada.addEventListener("blur", () => {
    cancelar();

    const decimales = Number(
      entrada.dataset.decimales
    );

    if (!entrada.value.trim()) {
      entrada.value =
        decimales === 3 ? "0.000" : "0.00";
    }

    try {
      entrada.value = formatear(
        convertir(entrada.value, decimales),
        decimales
      );
    } catch {
      // Conservar el texto para corregirlo.
    }

    actualizar();
  });
}

/* LIMPIAR */
function limpiarDatos() {
  if (!confirm(
    "¿Limpiar el mensaje y todos los datos? El precio volverá a 8.97."
  )) {
    return;
  }

  EMPRESAS.forEach((empresa) => {
    CAMPOS.forEach((campo) => {
      const entrada = $(`${empresa.id}-${campo.id}`);

      entrada.value = campo.inicial;
      entrada.setCustomValidity("");
      entrada.removeAttribute("aria-invalid");
    });
  });

  $("mensaje-stock").value = "";
  totalMensaje = null;

  liberarImagen();
  actualizar();

  $("mensaje-stock").focus();
}

function validarAccion() {
  const datos = actualizar(false);

  if (!datos) {
    const entrada = document.querySelector(
      '#empresas input[aria-invalid="true"]'
    );

    if (entrada) {
      entrada.focus();
      entrada.reportValidity();
    }
  }

  return datos;
}

/* EXCEL CON TRES CUADROS Y SOLO DOS TOTALES GENERALES */
async function exportarExcel() {
  const datos = validarAccion();

  if (!datos) return;

  if (!window.ExcelJS) {
    mostrarEstado(
      "Conéctate a internet y recarga la página para descargar Excel."
    );
    return;
  }

  const limite = 999999999999999n;
  const excede = (valor) =>
    valor > limite || valor < -limite;

  const campos = [
    "toneladas", "precio", "importe",
    "saldo", "excedente", "total"
  ];

  if (
    datos.some((empresa) =>
      campos.some((campo) => excede(empresa[campo]))
    ) ||
    campos.some((campo) => excede(sumar(datos, campo)))
  ) {
    mostrarEstado(
      "Las cantidades son demasiado grandes para exportarlas con precisión."
    );
    return;
  }

  const boton = $("btn-excel");
  boton.disabled = true;
  mostrarEstado("Preparando Excel…");

  let url;

  try {
    const comprobacion = comprobarTotal();
    const libro = new ExcelJS.Workbook();

    libro.creator = "Agrícola Los Médanos";
    libro.created = new Date();

    const hoja = libro.addWorksheet(
      "Control de descarte",
      {
        views: [{ showGridLines: false }],
        pageSetup: {
          paperSize: 9,
          orientation: "landscape",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 1,
          horizontalCentered: true,
          margins: {
            left: 0.25,
            right: 0.25,
            top: 0.35,
            bottom: 0.35,
            header: 0.15,
            footer: 0.15
          }
        }
      }
    );

    const colores = {
      verde: "FF286440",
      claro: "FFE6F0E4",
      amarillo: "FFFFFF00",
      rojo: "FFBD2028",
      error: "FFFFE9E9",
      gris: "FFF2F5F2",
      borde: "FFBAC8BC",
      blanco: "FFFFFFFF",
      texto: "FF202820"
    };

    const borde = {};

    ["top", "bottom", "left", "right"].forEach((lado) => {
      borde[lado] = {
        style: "thin",
        color: { argb: colores.borde }
      };
    });

    const numero = (valor, decimales) =>
      Number(decimalExacto(valor, decimales));

    const formatoDinero =
      '"S/ " #,##0.00;[Red]"S/ " -#,##0.00';

    hoja.columns = [
      { width: 27 }, { width: 25 }, { width: 4 },
      { width: 27 }, { width: 25 }, { width: 4 },
      { width: 27 }, { width: 25 }
    ];

    function estilo(celda, opciones = {}) {
      celda.font = {
        name: "Calibri",
        size: 12,
        color: { argb: colores.texto },
        ...opciones.font
      };

      celda.alignment = {
        vertical: "middle",
        horizontal: "left",
        wrapText: true,
        ...opciones.alignment
      };

      if (opciones.fondo) {
        celda.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: opciones.fondo }
        };
      }

      if (opciones.borde) {
        celda.border = borde;
      }
    }

    function combinar(rango, valor, opciones = {}) {
      hoja.mergeCells(rango);

      const celda = hoja.getCell(
        rango.split(":")[0]
      );

      celda.value = valor;
      estilo(celda, opciones);

      return celda;
    }

    combinar("A1:H2", "AGRÍCOLA LOS MÉDANOS", {
      fondo: colores.verde,
      font: {
        size: 22,
        bold: true,
        color: { argb: colores.blanco }
      },
      alignment: { horizontal: "center" }
    });

    hoja.getRow(1).height = 25;
    hoja.getRow(2).height = 20;

    combinar(
      "A3:H3",
      "CONTROL DE DESCARTE DE ARÁNDANOS · TONELADAS",
      {
        font: { size: 13, bold: true },
        alignment: { horizontal: "center" }
      }
    );

    hoja.getRow(3).height = 26;

    const fecha = new Date().toLocaleString("es-PE", {
      timeZone: "America/Lima",
      dateStyle: "short",
      timeStyle: "short"
    });

    combinar("A4:H4", `Generado: ${fecha} · Perú`, {
      font: { size: 10 },
      alignment: { horizontal: "right" }
    });

    const bloques = [
      { etiqueta: "A", valor: "B" },
      { etiqueta: "D", valor: "E" },
      { etiqueta: "G", valor: "H" }
    ];

    datos.forEach((empresa, indice) => {
      const { etiqueta, valor } = bloques[indice];

      combinar(
        `${etiqueta}6:${valor}6`,
        empresa.nombre.toUpperCase(),
        {
          fondo: colores.amarillo,
          font: { size: 16, bold: true },
          alignment: { horizontal: "center" },
          borde: true
        }
      );

      const filas = [
        [7, "CLIENTE", "Agrícola Los Médanos"],
        [8, "DESCARTE", "Arándanos"],
        [9, "TONELADAS", numero(empresa.toneladas, 3)],
        [10, "PRECIO POR TONELADA", numero(empresa.precio, 2)],
        [11, "SALDO A SUMAR", numero(empresa.saldo, 2)],
        [12, "ABONARON DE MÁS", numero(empresa.excedente, 2)],
        [13, "TOTAL A PAGAR", null]
      ];

      filas.forEach(([fila, titulo, contenido]) => {
        const nombre = hoja.getCell(
          `${etiqueta}${fila}`
        );

        const cantidad = hoja.getCell(
          `${valor}${fila}`
        );

        nombre.value = titulo;
        cantidad.value = contenido;

        estilo(nombre, { borde: true });
        estilo(cantidad, { borde: true });

        if (fila >= 9) {
          cantidad.alignment = {
            vertical: "middle",
            horizontal: "right"
          };

          cantidad.numFmt =
            fila === 9 ? "#,##0.000" : formatoDinero;
        }

        if (fila === 9) {
          cantidad.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFB5E3A0" }
          };
        }

        if (fila === 12) {
          [nombre, cantidad].forEach((celda) => {
            celda.font = {
              name: "Calibri",
              size: 12,
              color: { argb: colores.rojo }
            };
          });
        }

        if (fila === 13) {
          [nombre, cantidad].forEach((celda) => {
            estilo(celda, {
              borde: true,
              fondo: colores.claro,
              font: {
                size: 13,
                bold: true,
                color: { argb: colores.verde }
              },
              alignment: {
                horizontal:
                  celda === cantidad ? "right" : "left"
              }
            });
          });
        }
      });

      hoja.getCell(`${valor}13`).value = {
        formula:
          `ROUND(ROUND(${valor}9*${valor}10,2)+${valor}11-${valor}12,2)`,
        result: numero(empresa.total, 2)
      };
    });

    for (let fila = 6; fila <= 13; fila++) {
      hoja.getRow(fila).height =
        fila === 7 ? 44 : 34;
    }

    combinar("A16:H16", "RESUMEN GENERAL", {
      fondo: colores.verde,
      font: {
        size: 14,
        bold: true,
        color: { argb: colores.blanco }
      }
    });

    hoja.getRow(16).height = 30;

    const resumen = [
      [17, "TOTAL TONELADAS", "toneladas", 9, 3],
      [18, "TOTAL GENERAL A PAGAR", "total", 13, 2]
    ];

    resumen.forEach(
      ([fila, titulo, campo, origen, decimales]) => {
        combinar(`A${fila}:E${fila}`, titulo, {
          fondo: colores.gris,
          font: { bold: true },
          borde: true
        });

        const resultado = combinar(
          `F${fila}:H${fila}`,
          {
            formula:
              `SUM(B${origen},E${origen},H${origen})`,
            result: numero(
              sumar(datos, campo),
              decimales
            )
          },
          {
            fondo: colores.claro,
            font: { size: 14, bold: true },
            alignment: { horizontal: "right" },
            borde: true
          }
        );

        resultado.numFmt =
          decimales === 3
            ? '#,##0.000" t"'
            : formatoDinero;

        hoja.getRow(fila).height = 32;
      }
    );

    combinar(
      "A20:H20",
      "COMPROBACIÓN DEL DESCARTE TOTAL",
      {
        fondo: colores.verde,
        font: {
          bold: true,
          color: { argb: colores.blanco }
        }
      }
    );

    hoja.getRow(20).height = 28;

    combinar(
      "A21:E21",
      "DESCARTE TOTAL DEL MENSAJE",
      { borde: true }
    );

    const referencia = combinar(
      "F21:H21",
      totalMensaje === null
        ? "Sin referencia"
        : numero(totalMensaje, 3),
      {
        borde: true,
        alignment: { horizontal: "right" }
      }
    );

    referencia.numFmt = '#,##0.000" t"';

    combinar(
      "A22:E22",
      "SUMA DE LAS EMPRESAS",
      { borde: true }
    );

    const sumaExcel = combinar(
      "F22:H22",
      {
        formula: "SUM(B9,E9,H9)",
        result: numero(
          sumar(datos, "toneladas"),
          3
        )
      },
      {
        borde: true,
        alignment: { horizontal: "right" }
      }
    );

    sumaExcel.numFmt = '#,##0.000" t"';

    combinar("A23:E23", "DIFERENCIA", {
      borde: true
    });

    const diferenciaExcel = combinar(
      "F23:H23",
      totalMensaje === null
        ? "—"
        : {
            formula: "ROUND(F22-F21,3)",
            result: numero(
              comprobacion.diferencia,
              3
            )
          },
      {
        borde: true,
        alignment: { horizontal: "right" }
      }
    );

    diferenciaExcel.numFmt =
      '#,##0.000" t";[Red]-#,##0.000" t"';

    /*
     * La comprobación también se recalcula
     * si se editan las cantidades en Excel.
     */
    combinar(
      "A24:H24",
      totalMensaje === null
        ? "Sin descarte total de referencia."
        : {
            formula:
              'IF(ROUND(F22-F21,3)=0,"CORRECTO: el total coincide.","NO COINCIDE: revisa las cantidades.")',
            result:
              comprobacion.estado === "correcto"
                ? "CORRECTO: el total coincide."
                : "NO COINCIDE: revisa las cantidades."
          },
      {
        fondo: colores.gris,
        font: { bold: true }
      }
    );

    hoja.addConditionalFormatting({
      ref: "A24:H24",
      rules: [
        {
          type: "expression",
          formulae: [
            "AND(ISNUMBER($F$21),ROUND($F$22-$F$21,3)=0)"
          ],
          style: {
            fill: {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: colores.claro }
            },
            font: {
              bold: true,
              color: { argb: colores.verde }
            }
          }
        },
        {
          type: "expression",
          formulae: [
            "AND(ISNUMBER($F$21),ROUND($F$22-$F$21,3)<>0)"
          ],
          style: {
            fill: {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: colores.error }
            },
            font: {
              bold: true,
              color: { argb: colores.rojo }
            }
          }
        }
      ]
    });

    for (let fila = 21; fila <= 23; fila++) {
      hoja.getRow(fila).height = 28;
    }

    hoja.getRow(24).height = 36;

    combinar(
      "A26:H26",
      "TOTAL = toneladas × precio + saldo pendiente − abonado de más.",
      { font: { size: 11 } }
    );

    combinar(
      "A27:H27",
      "Cantidades copiadas sin convertir unidades. Un total negativo representa saldo a favor.",
      { font: { size: 10 } }
    );

    hoja.getRow(26).height = 24;
    hoja.getRow(27).height = 24;

    hoja.pageSetup.printArea = "A1:H27";

    hoja.headerFooter.oddFooter =
      "&LControl de descarte&RPágina &P de &N";

    libro.calcProperties.fullCalcOnLoad = true;

    const contenido = await libro.xlsx.writeBuffer();

    const archivo = new Blob([contenido], {
      type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    url = URL.createObjectURL(archivo);

    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = "Control-de-descarte.xlsx";

    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    mostrarEstado(
      comprobacion.estado === "error"
        ? "Excel generado. El descarte total no coincide; la advertencia está incluida."
        : "Excel generado con cuadros y comprobación."
    );
  } catch (error) {
    console.error("Error al exportar Excel:", error);

    mostrarEstado(
      "No se pudo generar el Excel. Intenta nuevamente."
    );
  } finally {
    if (url) {
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    boton.disabled = false;
  }
}

/* PREPARAR Y MOSTRAR IMAGEN */
function liberarImagen() {
  archivoImagen = null;

  const vista = $("vista-previa-imagen");
  const enlace = $("enlace-descargar-imagen");

  vista.removeAttribute("src");
  vista.hidden = true;

  enlace.removeAttribute("href");
  enlace.hidden = true;

  if (urlImagen) {
    URL.revokeObjectURL(urlImagen);
    urlImagen = null;
  }

  $("btn-compartir-imagen").hidden = true;
}

function puedeCompartirImagen() {
  try {
    return Boolean(
      archivoImagen &&
      window.isSecureContext &&
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({
        files: [archivoImagen]
      })
    );
  } catch {
    return false;
  }
}

async function exportarPNG() {
  if (!validarAccion()) return;

  if (!window.html2canvas) {
    mostrarEstado(
      "Conéctate a internet y recarga la página para crear la imagen."
    );
    return;
  }

  const boton = $("btn-png");
  boton.disabled = true;

  mostrarEstado("Preparando imagen…");

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const canvas = await window.html2canvas(
      $("reporte"),
      {
        backgroundColor: "#ffffff",
        scale: 2,
        windowWidth: 1400,

        onclone: (documento) => {
          const reporte =
            documento.getElementById("reporte");

          reporte.classList.add("modo-exportacion");

          reporte.querySelectorAll("input").forEach(
            (entrada) => {
              const decimales = Number(
                entrada.dataset.decimales
              );

              const texto =
                documento.createElement("span");

              texto.className = "valor-exportado";
              texto.textContent = formatear(
                convertir(entrada.value, decimales),
                decimales
              );

              entrada.replaceWith(texto);
            }
          );
        }
      }
    );

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((resultado) => {
        if (resultado) {
          resolve(resultado);
        } else {
          reject(new Error("No se pudo crear la imagen"));
        }
      }, "image/png");
    });

    liberarImagen();

    archivoImagen = new File(
      [blob],
      "Control-de-descarte.png",
      { type: "image/png" }
    );

    urlImagen = URL.createObjectURL(archivoImagen);

    const vista = $("vista-previa-imagen");
    vista.src = urlImagen;
    vista.hidden = false;

    const enlace = $("enlace-descargar-imagen");
    enlace.href = urlImagen;
    enlace.hidden = false;

    const compartirDisponible = puedeCompartirImagen();

    $("btn-compartir-imagen").hidden =
      !compartirDisponible;

    $("ayuda-imagen").textContent =
      compartirDisponible
        ? "Pulsa “Guardar o compartir”. El teléfono mostrará las opciones disponibles. Si aparece “Guardar imagen”, selecciónala para guardarla en Fotos."
        : "Puedes descargar la imagen o mantenerla pulsada para ver las opciones de guardado disponibles en tu teléfono.";

    mostrarEstadoImagen(
      comprobarTotal().estado === "error"
        ? "Atención: el descarte total no coincide. La imagen incluye la advertencia."
        : "Imagen lista."
    );

    $("dialogo-imagen").showModal();

    mostrarEstado(
      "Imagen lista. Elige cómo guardarla en la ventana."
    );
  } catch (error) {
    console.error("Error al crear imagen:", error);

    mostrarEstado(
      "No se pudo crear la imagen. Intenta nuevamente."
    );
  } finally {
    boton.disabled = false;
  }
}

/*
 * Se ejecuta con un segundo toque del usuario.
 * Así el teléfono puede abrir su menú nativo de compartir.
 */
async function compartirImagen() {
  if (!archivoImagen) {
    mostrarEstadoImagen(
      "Primero genera la imagen nuevamente."
    );
    return;
  }

  if (!puedeCompartirImagen()) {
    mostrarEstadoImagen(
      "Este navegador no permite compartir archivos. Usa “Descargar imagen” o mantén pulsada la vista previa."
    );
    return;
  }

  const boton = $("btn-compartir-imagen");
  boton.disabled = true;

  try {
    await navigator.share({
      files: [archivoImagen]
    });

    mostrarEstadoImagen(
      "Se completó la acción elegida en el teléfono."
    );
  } catch (error) {
    mostrarEstadoImagen(
      error.name === "AbortError"
        ? "No se completó la acción. Puedes intentarlo otra vez."
        : "No se pudo compartir. Usa “Descargar imagen” o mantén pulsada la vista previa."
    );
  } finally {
    boton.disabled = false;
  }
}

/* INICIO */
function iniciar() {
  const carga = cargarDatos();

  actualizar(false);

  document.querySelectorAll("#empresas input").forEach(
    prepararEntrada
  );

  $("btn-importar").addEventListener(
    "click",
    importarMensaje
  );

  $("btn-png").addEventListener(
    "click",
    exportarPNG
  );

  $("btn-excel").addEventListener(
    "click",
    exportarExcel
  );

  $("btn-limpiar").addEventListener(
    "click",
    limpiarDatos
  );

  $("btn-compartir-imagen").addEventListener(
    "click",
    compartirImagen
  );

  $("enlace-descargar-imagen").addEventListener(
    "click",
    () => {
      mostrarEstadoImagen(
        "Se solicitó la descarga. Revisa Descargas o Archivos; el navegador decide la ubicación."
      );
    }
  );

  $("dialogo-imagen").addEventListener(
    "close",
    () => {
      // Conservar la imagen hasta crear otra o limpiar.
      mostrarEstadoImagen("");
    }
  );

  if (carga === "recuperado") {
    mostrarEstado(
      "Tus datos guardados están listos. Revisa la comprobación del total."
    );
  } else if (carga === "error") {
    mostrarEstado(
      "No se pudieron recuperar los datos. Pega el mensaje para comenzar."
    );
  } else {
    mostrarEstado(
      "Pega el mensaje y pulsa “Completar y comprobar”."
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    iniciar
  );
} else {
  iniciar();
}
