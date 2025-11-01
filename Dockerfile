FROM nginx:alpine

# Remove default Nginx index.html
RUN rm -rf /usr/share/nginx/html/*

# COPY folder dist to nginx html folder
COPY dist/ /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Run Nginx
CMD ["nginx", "-g", "daemon off;"]