# Métodos de escurrimiento en carga

<!-- Parte de la serie de explicación de Hidráulica 1D -->

La opción `SURCHARGE_METHOD` selecciona cómo se trata el escurrimiento presurizado en los conductos cerrados. Los tres métodos actualizan el área hidráulica de un conducto en carga (tirante $> y_{\mathrm{full}}$) agregando una ranura angosta de ancho $w_s$:

$$A = A_{\mathrm{full}} + (y - y_{\mathrm{full}})\,w_s,$$

mientras que el radio hidráulico se fija en su valor de sección llena $R_{\mathrm{full}}$ (la ranura aporta almacenamiento pero no fricción).

## EXTRAN (por defecto)

El método de perturbación clásico de la Sección 10: actualizaciones de nodo en carga basadas en $dQ/dH$ con un corte de clave en $y/y_{\mathrm{full}} = 0.96$ usado para el ancho empleado en el cálculo del área superficial.

## Ranura de Preissmann estática

El conducto lleva una ranura ficticia angosta sobre la clave para que la formulación de superficie libre siga siendo válida durante toda la presurización. El ancho de ranura sigue la fórmula de Sjöberg (1982),

$$\frac{w_s}{W_{\max}} = 0.5423\, \exp\!\left(-\left(\frac{y}{y_{\mathrm{full}}}\right)^{2.4}\right),$$

aplicada para $0.985257 \le y/y_{\mathrm{full}} \le 1.78$, fijada en $w_s = 0.01\,W_{\max}$ sobre ese rango y cero bajo el corte.

## Ranura de Preissmann dinámica

Una extensión de OpenSWMM (Sharior, Hodges & Vasconcelos 2023) en la que el área de la ranura evoluciona en el tiempo como un elemento de almacenamiento transitorio. El ancho superior de la ranura está gobernado por una celeridad de onda de presión objetivo $c_{pT}$ y por un número de Preissmann variable en el tiempo $P$:

$$T_s = \frac{g\,A_{\mathrm{full}}}{c_{pT}^{2}}\,P^{2}, \qquad P_{0} = \max\!\left(\frac{c_{pT}}{\alpha\,c_g},\ 1\right), \qquad c_g = \sqrt{g\,A_{\mathrm{full}}/W_{\max}},$$

con el parámetro de choque $\alpha = 3$ (por defecto). El área de ranura acumulada depende de la trayectoria,

$$A_s \leftarrow \max\!\left(A_s + T_s\,\Delta h_s,\ 0\right), \qquad h_s = \max(\bar y - y_{\mathrm{full}},\ 0),$$

y $P$ decae exponencialmente después del inicio de la presurización y se suaviza espacialmente entre los nodos. Mientras una ranura está activa, el ancho superior es $T_s$ y el área superficial aportada a un nodo extremo en carga es $T_s\,L/4$. Las cargas de los nodos se actualizan en todo momento con la fórmula ordinaria de superficie libre; la rama de carga nunca se invoca. El paso de tiempo variable usa la celeridad de presión $c_p = c_{pT}/P$.
