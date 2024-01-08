FROM ubuntu:22.04

RUN apt-get update && apt-get install -y g++ gcc make python3 git default-jdk default-jre rsync wget

# Required for Cypress
RUN apt-get install -y libgtk2.0-0 libgtk-3-0 libgbm-dev libnotify-dev libgconf-2-4 libnss3 libxss1 libasound2 libxtst6 xauth xvfb curl xdg-utils

# Required for Playwright
RUN apt-get install -y --no-install-recommends libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 libwayland-client0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 xvfb fonts-noto-color-emoji fonts-unifont libfontconfig1 libfreetype6 xfonts-cyrillic xfonts-scalable fonts-liberation fonts-ipafont-gothic fonts-wqy-zenhei fonts-tlwg-loma-otf fonts-freefont-ttf ffmpeg libcairo-gobject2 libdbus-glib-1-2 libgdk-pixbuf-2.0-0 libgtk-3-0 libpangocairo-1.0-0 libx11-xcb1 libxcb-shm0 libxcursor1 libxi6 libxrender1 libxtst6 libenchant-2-2 gstreamer1.0-libav gstreamer1.0-plugins-bad gstreamer1.0-plugins-base gstreamer1.0-plugins-good libicu70 libegl1 libepoxy0 libevdev2 libffi7 libgles2 libglx0 libgstreamer-gl1.0-0 libgstreamer-plugins-base1.0-0 libgstreamer1.0-0 libgudev-1.0-0 libharfbuzz-icu0 libharfbuzz0b libhyphen0 libjpeg-turbo8 liblcms2-2 libmanette-0.2-0 libnotify4 libopengl0 libopenjp2-7 libopus0 libpng16-16 libproxy1v5 libsecret-1-0 libsoup2.4-1 libwayland-egl1 libwayland-server0 libwebpdemux2 libwoff1 libxml2 libxslt1.1 libx264-163 libatomic1 libevent-2.1-7 gnupg2

# Install browsers
RUN sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list'
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add -
RUN apt-get update
RUN apt-get -y install google-chrome-stable chromium-browser firefox

# Create workflow user
RUN groupadd -g 10001 workflows
RUN useradd -m -u 10000 -g 10001 workflows
RUN mkdir /home/workflows/workspace
RUN mkdir -p /home/workflows/.npm-global/lib /home/workflows/.npm-global/bin
RUN chown -R 10000:10001 /home/workflows
ENV NPM_CONFIG_PREFIX=/home/workflows/.npm-global
ENV PATH=$PATH:/home/workflows/.npm-global/bin

# Node.js
COPY --from=node:20.9.0 /usr/local/bin /usr/local/bin
COPY --from=node:20.9.0 /usr/local/lib /usr/local/lib
COPY --from=node:20.9.0 /opt /opt

USER workflows

WORKDIR /home/workflows/workspace

ENTRYPOINT [ "/home/workflows/executor-binary/nx-cloud-workflow-executor" ]
