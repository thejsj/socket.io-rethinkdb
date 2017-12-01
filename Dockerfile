# Full list of versions available here: https://registry.hub.docker.com/_/node/tags/manage/\n' +
FROM node:latest

# Add repository files to container

ENV DB_NAME=WORLD

#Start: Packages
RUN apt-get update -y && apt-get install -y vim
#End

#Start: Main Repository
ADD ["./", "/app"]
#End

WORKDIR /app


# Open up ports on the container
EXPOSE 8080

# Command to start the app
CMD npm start
